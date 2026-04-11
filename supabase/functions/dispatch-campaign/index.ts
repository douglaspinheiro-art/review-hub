// supabase/functions/dispatch-campaign/index.ts
// Deno Edge Function — dispatches a campaign to its target contacts via Meta Cloud API.
//
// POST /functions/v1/dispatch-campaign
// Headers: Authorization: Bearer <user_jwt>
// Body: { campaign_id: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z, errorResponse, validateBrowserOrigin } from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";
import { metaGraphSendImageLink } from "../_shared/meta-graph-send.ts";
import { outboundSendMetaTemplate, outboundSendText } from "../_shared/whatsapp-outbound.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTI_SPAM_DELAY_MS = 1200;
/** Evita timeout da Edge Function; use "Disparar" de novo para continuar o lote. */
const MAX_SENDS_PER_INVOCATION = 35;
const BodySchema = z.object({ campaign_id: uuidSchema });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function wrapLinksForTracking(
  text: string,
  campaignId: string,
  userId: string,
  contactId: string,
): string {
  const base = `${SUPABASE_URL}/functions/v1/track-whatsapp-click`;
  return text.replace(/https?:\/\/[^\s)]+/g, (url) => {
    const tracked = `${base}?cid=${encodeURIComponent(campaignId)}&uid=${encodeURIComponent(userId)}&contact=${encodeURIComponent(contactId)}&url=${encodeURIComponent(url)}`;
    return tracked;
  });
}

function hashBucket(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 100);
}

function clampPct(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(50, Math.max(0, num));
}

function graphToResult(v: { messages?: Array<{ id?: string }> } | null): {
  key?: { id?: string };
  messageId?: string;
} | null {
  const id = v?.messages?.[0]?.id;
  if (!id) return null;
  return { messageId: id, key: { id } };
}

// ── Contact resolution ────────────────────────────────────────────────────────

async function resolveContacts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  storeId: string,
  campaignId: string,
): Promise<{
  targets: Array<{ id: string; name: string; phone: string; email?: string | null; tags: string[]; status: string }>;
  holdouts: Array<{ id: string; name: string; phone: string; email?: string | null; tags: string[]; status: string }>;
  suppressedCooldown: Array<{ id: string; name: string; phone: string; email?: string | null; tags: string[]; status: string }>;
  outsideSendWindow: boolean;
}> {
  // Get segment rules for this campaign
  const { data: segments } = await supabase
    .from("campaign_segments")
    .select("type, filters")
    .eq("campaign_id", campaignId);
  const { data: campaignMeta } = await supabase
    .from("campaigns")
    .select("tags")
    .eq("id", campaignId)
    .maybeSingle();

  let query = supabase
    .from("customers_v3")
    .select("id, name, phone, email, rfm_segment, rfm_monetary, rfm_recency, churn_score, last_purchase_at, unsubscribed_at")
    .eq("store_id", storeId)
    .is("unsubscribed_at", null);

  let holdoutPct = 0;
  let minExpectedValue = 0;
  let maxRecipients = 0;
  let cooldownHours = 24;
  let sendWindowStartHour = 8;
  let sendWindowEndHour = 21;
  let timezoneOffsetHours = -3; // default BR timezone

  if (segments && segments.length > 0) {
    const seg = segments[0];
    const segKey = String(seg.filters?.segment_key ?? "");
    if (seg.type === "rfm" && seg.filters?.rfm_segment) {
      query = query.eq("rfm_segment", seg.filters.rfm_segment);
    } else if (segKey === "vip") {
      query = query.in("rfm_segment", ["champions", "loyal"]);
    } else if (segKey === "inactive") {
      query = query.in("rfm_segment", ["at_risk", "lost"]);
    } else if (segKey === "active") {
      query = query.in("rfm_segment", ["champions", "loyal", "new"]);
    } else if (seg.type === "custom" && seg.filters?.min_spent) {
      query = query.gte("rfm_monetary", seg.filters.min_spent);
    }
    holdoutPct = clampPct(seg.filters?.holdout_pct, 0);
    minExpectedValue = Number(seg.filters?.min_expected_value ?? 0);
    maxRecipients = Number(seg.filters?.max_recipients ?? 0);
    cooldownHours = Math.max(1, Number(seg.filters?.cooldown_hours ?? 24));
    sendWindowStartHour = Math.min(23, Math.max(0, Number(seg.filters?.send_window_start_hour ?? 8)));
    sendWindowEndHour = Math.min(23, Math.max(0, Number(seg.filters?.send_window_end_hour ?? 21)));
    timezoneOffsetHours = Number(seg.filters?.timezone_offset_hours ?? -3);
  } else {
    const tags = ((campaignMeta as any)?.tags ?? []) as string[];
    const firstTag = String(tags[0] ?? "");
    if (firstTag === "vip") query = query.in("rfm_segment", ["champions", "loyal"]);
    else if (firstTag === "inactive") query = query.in("rfm_segment", ["at_risk", "lost"]);
    else if (firstTag === "active") query = query.in("rfm_segment", ["champions", "loyal", "new"]);
  }

  const { data, error } = await query;
  if (error) throw error;
  const raw = data ?? [];

  let baseCandidates = raw;
  const segKey = String(segments?.[0]?.filters?.segment_key ?? ((campaignMeta as any)?.tags ?? [])[0] ?? "");
  const requireAbandonedCart = Boolean(segments?.[0]?.filters?.require_abandoned_cart) || segKey === "cart_abandoned";
  if (requireAbandonedCart) {
    const customerIds = raw.map((r) => r.id);
    if (customerIds.length > 0) {
      const { data: carts } = await (supabase as any)
        .from("abandoned_carts")
        .select("customer_id,status")
        .eq("store_id", storeId)
        .in("customer_id", customerIds)
        .in("status", ["pending", "open"]);
      const cartIds = new Set((carts ?? []).map((c: any) => c.customer_id));
      baseCandidates = raw.filter((r) => cartIds.has(r.id));
    } else {
      baseCandidates = [];
    }
  }

  const scored = baseCandidates
    .filter((c) => c.phone)
    .map((c) => {
      const monetary = Number(c.rfm_monetary ?? 1);
      const recency = Number(c.rfm_recency ?? 1);
      const churn = Number(c.churn_score ?? 0);
      // rfm_* scores are 1–5 (higher = better recency / frequency / monetary tier)
      const expectedValue = (Math.min(5, Math.max(1, monetary)) * 18)
        + (Math.min(5, Math.max(1, recency)) * 18)
        + (Math.max(0, 1 - Math.min(1, churn)) * 12);
      return { ...c, expectedValue };
    })
    .filter((c) => c.expectedValue >= minExpectedValue)
    .sort((a, b) => b.expectedValue - a.expectedValue);

  const limited = maxRecipients > 0 ? scored.slice(0, maxRecipients) : scored;

  // Frequency cap / cooldown suppression using recent sends.
  const ids = limited.map((c) => c.id);
  let suppressedByCooldown = new Set<string>();
  if (ids.length > 0) {
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const { data: recent } = await (supabase as any)
      .from("message_sends")
      .select("customer_id,status,created_at")
      .eq("store_id", storeId)
      .in("customer_id", ids)
      .gte("created_at", cutoff);
    suppressedByCooldown = new Set(
      (recent ?? [])
        .filter((r: any) => String(r.status ?? "").startsWith("sent"))
        .map((r: any) => r.customer_id),
    );
  }

  const nowStore = new Date(Date.now() + timezoneOffsetHours * 60 * 60 * 1000);
  const hour = nowStore.getUTCHours();
  const inSendWindow = sendWindowStartHour <= sendWindowEndHour
    ? hour >= sendWindowStartHour && hour <= sendWindowEndHour
    : hour >= sendWindowStartHour || hour <= sendWindowEndHour;

  const eligible = limited.filter((c) => !suppressedByCooldown.has(c.id));
  const suppressedCooldown = limited.filter((c) => suppressedByCooldown.has(c.id));
  if (!inSendWindow) {
    return {
      targets: [],
      holdouts: [],
      suppressedCooldown: [],
      outsideSendWindow: true,
    };
  }

  const targets = holdoutPct > 0
    ? eligible.filter((c) => hashBucket(`${campaignId}:${c.id}`) >= holdoutPct)
    : eligible;
  const holdouts = holdoutPct > 0
    ? eligible.filter((c) => hashBucket(`${campaignId}:${c.id}`) < holdoutPct)
    : [];

  return {
    targets: targets as Array<{ id: string; name: string; phone: string; email?: string | null; tags: string[]; status: string }>,
    holdouts: holdouts as Array<{ id: string; name: string; phone: string; email?: string | null; tags: string[]; status: string }>,
    suppressedCooldown: suppressedCooldown as Array<{ id: string; name: string; phone: string; email?: string | null; tags: string[]; status: string }>,
    outsideSendWindow: false,
  };
}

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

async function resolveSuppressedOptOut(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  campaignId: string,
): Promise<Array<{ id: string; phone: string }>> {
  const { data: segments } = await supabase
    .from("campaign_segments")
    .select("type, filters")
    .eq("campaign_id", campaignId);

  let query = supabase
    .from("customers_v3")
    .select("id, phone")
    .eq("store_id", storeId)
    .not("unsubscribed_at", "is", null);

  if (segments && segments.length > 0) {
    const seg = segments[0];
    if (seg.type === "rfm" && seg.filters?.rfm_segment) {
      query = query.eq("rfm_segment", seg.filters.rfm_segment);
    } else if (seg.type === "custom" && seg.filters?.min_spent) {
      query = query.gte("rfm_monetary", seg.filters.min_spent);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).filter((r) => r.phone);
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }
  const originCheck = validateBrowserOrigin(req);
  if (originCheck) return originCheck;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const isInternal = authHeader === `Bearer ${SUPABASE_SERVICE_KEY}`;

    const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 64 * 1024, schema: BodySchema });
    if (!parsedReq.ok) return parsedReq.response;
    const { campaign_id } = parsedReq.data;

    // Use service role to bypass RLS for server-side operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get user from JWT (external calls only)
    let requesterUserId: string | null = null;
    if (!isInternal) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }
      requesterUserId = user.id;
    }

    // Load campaign
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .select(
        "id, name, message, blocks, status, store_id, user_id, ab_test_id, channel, sent_count, source_prescription_id",
      )
      .eq("id", campaign_id)
      .single();

    if (campError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
    }
    if (!isInternal && requesterUserId && !(await canDispatchCampaign(supabase, requesterUserId, campaign))) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
    }
    const actorUserId = campaign.user_id as string;

    const channel = String((campaign as { channel?: string }).channel ?? "whatsapp").toLowerCase();
    if (channel !== "whatsapp") {
      return new Response(
        JSON.stringify({
          error: "Esta campanha não é WhatsApp. Use a área Newsletter para e-mail ou o fluxo de SMS quando disponível.",
        }),
        { status: 400 },
      );
    }

    if (!campaign.store_id) {
      return new Response(
        JSON.stringify({ error: "Associe a campanha a uma loja antes de disparar." }),
        { status: 422 },
      );
    }

    if (campaign.status === "completed") {
      return new Response(JSON.stringify({ error: "Campaign already dispatched" }), { status: 409 });
    }

    const isResume = campaign.status === "running";
    if (!isResume && campaign.status !== "draft" && campaign.status !== "scheduled") {
      return new Response(JSON.stringify({ error: "Campaign cannot be dispatched in this state" }), { status: 409 });
    }

    // Load WhatsApp connection
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select(
        "instance_name, status, provider, meta_phone_number_id, meta_access_token, meta_api_version, meta_default_template_name",
      )
      .eq("store_id", campaign.store_id)
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!conn) {
      return new Response(
        JSON.stringify({ error: "No active WhatsApp connection for this store." }),
        { status: 422 },
      );
    }

    const prov = (conn as { provider?: string }).provider ?? "meta_cloud";
    if (prov !== "meta_cloud") {
      return new Response(
        JSON.stringify({ error: "Apenas conexões Meta Cloud API são suportadas. Atualize em Dashboard → WhatsApp." }),
        { status: 422 },
      );
    }
    const c = conn as { meta_phone_number_id?: string | null; meta_access_token?: string | null };
    if (!c.meta_phone_number_id?.trim() || !c.meta_access_token?.trim()) {
      return new Response(
        JSON.stringify({ error: "Meta Cloud API não configurada (phone_number_id / token)." }),
        { status: 422 },
      );
    }

    if (!isResume) {
      await supabase
        .from("campaigns")
        .update({ status: "running" })
        .eq("id", campaign_id);
    }

    // Resolve target contacts using prioritization + optional holdout.
    const {
      targets: contacts,
      holdouts,
      suppressedCooldown,
      outsideSendWindow,
    } = await resolveContacts(
      supabase,
      actorUserId,
      campaign.store_id,
      campaign_id,
    );

    if (outsideSendWindow) {
      if (!isResume) {
        await supabase
          .from("campaigns")
          .update({ status: "draft", total_contacts: 0 })
          .eq("id", campaign_id);
      }
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          failed: 0,
          total: 0,
          suppressed_opt_out: 0,
          suppressed_cooldown: 0,
          dispatch_reason: "outside_send_window",
          message: "Fora da janela de envio configurada no segmento. Tente novamente no horário permitido.",
        }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
      );
    }

    if (!isResume) {
      const rxId = (campaign as { source_prescription_id?: string | null }).source_prescription_id;
      if (rxId) {
        const { error: prRxErr } = await supabase
          .from("prescriptions")
          .update({ status: "em_execucao" })
          .eq("id", rxId)
          .eq("user_id", actorUserId);
        if (prRxErr) console.warn("prescription em_execucao sync:", prRxErr.message);
      }
    }

    const { count: existingDispatchLog } = await supabase
      .from("message_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id);
    const alreadyInitialized = (existingDispatchLog ?? 0) > 0;

    const { data: sentRows } = await supabase
      .from("message_sends")
      .select("customer_id,status")
      .eq("campaign_id", campaign_id);
    const sentCustomerIds = new Set(
      (sentRows ?? [])
        .filter((r: { status?: string | null }) => String(r.status ?? "").startsWith("sent"))
        .map((r: { customer_id?: string | null }) => r.customer_id)
        .filter(Boolean) as string[],
    );

    const eligible = contacts.filter((c) => !sentCustomerIds.has(c.id));
    const batch = eligible.slice(0, MAX_SENDS_PER_INVOCATION);
    const partial = eligible.length > batch.length;

    const contactIds = batch.map((c) => c.id);
    const { data: carts } = contactIds.length > 0
      ? await (supabase as any)
        .from("abandoned_carts")
        .select("customer_id,cart_value,recovery_url,cart_items,created_at")
        .eq("store_id", campaign.store_id)
        .in("customer_id", contactIds)
        .order("created_at", { ascending: false })
      : { data: [] };
    const latestCartByCustomer = new Map<string, any>();
    for (const cart of (carts ?? [])) {
      if (!latestCartByCustomer.has(cart.customer_id)) {
        latestCartByCustomer.set(cart.customer_id, cart);
      }
    }

    // Track suppressed contacts for visibility in incremental analysis (uma vez por campanha).
    const suppressedOptOut = await resolveSuppressedOptOut(supabase, campaign.store_id, campaign_id);

    if (!alreadyInitialized) {
      if (suppressedOptOut.length > 0) {
        await (supabase as any).from("message_sends").insert(
          suppressedOptOut.map((contact: any) => ({
            user_id: actorUserId,
            store_id: campaign.store_id,
            campaign_id,
            customer_id: contact.id,
            phone: normalizePhone(contact.phone),
            status: "suppressed_opt_out",
          })),
        );
      }
      if (suppressedCooldown.length > 0) {
        await (supabase as any).from("message_sends").insert(
          suppressedCooldown.map((contact) => ({
            user_id: actorUserId,
            store_id: campaign.store_id,
            campaign_id,
            customer_id: contact.id,
            phone: normalizePhone(contact.phone),
            status: "suppressed_cooldown",
          })),
        );
      }

      if (holdouts.length > 0) {
        await (supabase as any).from("message_sends").insert(
          holdouts.map((contact) => ({
            user_id: actorUserId,
            store_id: campaign.store_id,
            campaign_id,
            customer_id: contact.id,
            phone: normalizePhone(contact.phone),
            status: "holdout",
          })),
        );
      }
    }

    // Enqueue ELIGIBLE contacts into scheduled_messages
    if (eligible.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
        const chunk = eligible.slice(i, i + CHUNK_SIZE);
        const { error: insErr } = await supabase.from("scheduled_messages").insert(
          chunk.map((contact) => {
            const cart = latestCartByCustomer.get(contact.id);
            const firstItem = Array.isArray(cart?.cart_items) && cart.cart_items.length > 0 ? cart.cart_items[0] : null;
            const text = interpolate(campaign.message, {
              name: contact.name ?? "",
              phone: contact.phone ?? "",
              email: contact.email ?? "",
              valor_carrinho: cart?.cart_value != null
                ? Number(cart.cart_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "",
              ultimo_produto: firstItem?.name ?? "",
              link_checkout: cart?.recovery_url ?? "",
            });
            // Link tracking is handled here so it's ready in the DB
            const trackedText = wrapLinksForTracking(text, campaign_id, actorUserId, contact.id);

            return {
              user_id: actorUserId,
              store_id: campaign.store_id,
              customer_id: contact.id,
              journey_id: null, // this is a manual campaign
              campaign_id: campaign_id,
              message_content: trackedText,
              scheduled_for: new Date().toISOString(),
              status: "pending",
              metadata: {
                campaign_name: campaign.name,
                content_type: (campaign as any)?.blocks?.whatsapp?.content_type || "text",
                media_url: (campaign as any)?.blocks?.whatsapp?.media_url || null,
                meta_template_name: (campaign as any)?.blocks?.whatsapp?.meta_template_name || null,
              }
            };
          })
        );
        if (insErr) throw insErr;
      }
    }

    await supabase
      .from("campaigns")
      .update({
        status: "running",
        total_contacts: contacts.length + holdouts.length,
        sent_count: 0
      })
      .eq("id", campaign_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Campanha WhatsApp enfileirada com sucesso.",
        enqueued: eligible.length,
        total: contacts.length + holdouts.length,
      }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );

  } catch (err) {
    console.error(`[${requestId}] dispatch-campaign error:`, err);
    return errorResponse(`Internal server error [${requestId}]`, 500);
  }
});
