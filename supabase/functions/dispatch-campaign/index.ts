// supabase/functions/dispatch-campaign/index.ts
// Deno Edge Function — enfileira campanha WhatsApp via RPC (Segmentação Server-side).
// Otimizado para escalabilidade (Evita OOM com bases grandes).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  z,
  corsHeaders,
  errorResponse,
  validateBrowserOrigin,
  checkDistributedRateLimit,
  rateLimitedResponse,
  timingSafeEqual,
} from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Dedicated secret for internal campaign dispatch calls (cron, automation triggers).
// Must NOT be SUPABASE_SERVICE_ROLE_KEY — use a randomly generated value.
const DISPATCH_CAMPAIGN_SECRET = Deno.env.get("DISPATCH_CAMPAIGN_SECRET") ?? "";
const BodySchema = z.object({ campaign_id: uuidSchema });

async function canDispatchCampaign(
  supabase: ReturnType<typeof createClient>,
  requesterUserId: string,
  campaign: { user_id: string; store_id: string | null },
): Promise<boolean> {
  if (campaign.user_id === requesterUserId) return true;
  if (!campaign.store_id) return false;
  const { data: store } = await supabase.from("stores").select("user_id").eq("id", campaign.store_id).maybeSingle();
  const ownerId = store?.user_id as string | undefined;
  if (!ownerId) return false;
  if (ownerId === requesterUserId) return true;
  const { data: team } = await supabase
    .from("team_members")
    .select("id")
    .eq("account_owner_id", ownerId)
    .eq("invited_user_id", requesterUserId)
    .eq("status", "active")
    .maybeSingle();
  return !!team;
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();

  // Validate browser origin before responding to ANY request, including preflight.
  // Returning "*" on OPTIONS before origin validation allows CSRF from any origin.
  const originCheck = validateBrowserOrigin(req);
  if (originCheck) return originCheck;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    // Internal callers (cron, trigger-automations) must use DISPATCH_CAMPAIGN_SECRET,
    // NOT the service role key. This limits blast radius if the secret leaks.
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isInternal =
      DISPATCH_CAMPAIGN_SECRET.length >= 32 &&
      timingSafeEqual(bearerToken, DISPATCH_CAMPAIGN_SECRET);
    const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 64 * 1024, schema: BodySchema });
    if (!parsedReq.ok) return parsedReq.response;
    const { campaign_id } = parsedReq.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let requesterUserId: string | null = null;
    if (!isInternal) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      requesterUserId = user.id;
      const { allowed } = await checkDistributedRateLimit(supabase, `dispatch-campaign:${requesterUserId}`, 12, 60_000);
      if (!allowed) return rateLimitedResponse();
    }

    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .select("id, name, message, blocks, status, store_id, user_id, channel, source_prescription_id")
      .eq("id", campaign_id)
      .single();

    if (campError || !campaign) return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
    if (!isInternal && requesterUserId && !(await canDispatchCampaign(supabase, requesterUserId, campaign))) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
    }

    if (!campaign.store_id) return new Response(JSON.stringify({ error: "Associe a campanha a uma loja." }), { status: 422 });
    if (campaign.status === "completed") return new Response(JSON.stringify({ error: "Campaign already dispatched" }), { status: 409 });

    // Rate limit internal callers (cron/automations) per store — max 10 dispatches/min.
    // Prevents a misconfigured automation from exhausting the message quota silently.
    if (isInternal) {
      const { allowed: internalAllowed } = await checkDistributedRateLimit(
        supabase,
        `dispatch-campaign:internal:${campaign.store_id}`,
        10,
        60_000,
      );
      if (!internalAllowed) return rateLimitedResponse();
    }

    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("status, provider, meta_phone_number_id, meta_access_token")
      .eq("store_id", campaign.store_id)
      .eq("status", "connected")
      .maybeSingle();

    if (!conn || conn.provider !== "meta_cloud") {
      return new Response(JSON.stringify({ error: "Conexão Meta Cloud ativa necessária." }), { status: 422 });
    }

    // 1. Fetch Segment Configuration
    const { data: segments } = await supabase.from("campaign_segments").select("filters").eq("campaign_id", campaign_id).maybeSingle();
    const filters = segments?.filters || {};

    // 2. Execute Server-side Segmentation & Enqueueing
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("execute_campaign_segmentation_v4", {
      p_campaign_id: campaign_id,
      p_store_id: campaign.store_id,
      p_actor_user_id: campaign.user_id,
      p_holdout_pct: Number(filters.holdout_pct ?? 0),
      p_min_expected_value: Number(filters.min_expected_value ?? 0),
      p_max_recipients: Number(filters.max_recipients ?? 0),
      p_cooldown_hours: Number(filters.cooldown_hours ?? 24),
      p_message_template: campaign.message,
      p_meta_template_name: (campaign.blocks as any)?.whatsapp?.meta_template_name || null,
      p_content_type: (campaign.blocks as any)?.whatsapp?.content_type || "text",
      p_media_url: (campaign.blocks as any)?.whatsapp?.media_url || null,
      p_campaign_name: campaign.name
    });

    if (rpcErr) throw rpcErr;
    const stats = rpcRes[0] || { enqueued_count: 0, holdout_count: 0, cooldown_count: 0, opt_out_count: 0 };

    // 3. Sync Prescription if needed
    if (campaign.source_prescription_id) {
      await supabase.from("prescriptions").update({ status: "em_execucao" }).eq("id", campaign.source_prescription_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Campanha WhatsApp enfileirada via Server-side RPC.",
        enqueued: stats.enqueued_count,
        holdouts: stats.holdout_count,
        cooldown: stats.cooldown_count,
        opt_out: stats.opt_out_count,
        total: stats.enqueued_count + stats.holdout_count
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(`[${requestId}] dispatch-campaign error:`, err);
    return errorResponse(`Internal server error [${requestId}]`, 500);
  }
});

