/**
 * Proxy autenticado para envio WhatsApp Cloud API (Meta) — token só no edge.
 * O browser chama com JWT; credenciais Meta ficam no servidor.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  errorResponse,
  validateBrowserOrigin,
  checkDistributedRateLimit,
  rateLimitedResponseWithRetry,
  z,
} from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";
import {
  metaGraphFetchPhoneNumber,
  metaGraphSendTemplate,
  metaGraphSendText,
} from "../_shared/meta-graph-send.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function metaErrorRetryHint(err: unknown): { retryable: boolean; status: number } {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/Meta Graph (?:template )?error (\d+)/);
  const status = m ? Number(m[1]) : 0;
  if (status === 429 || status === 408) return { retryable: true, status };
  if (status >= 500) return { retryable: true, status };
  return { retryable: false, status };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    connectionId: uuidSchema,
    kind: z.literal("verify"),
  }),
  z.object({
    connectionId: uuidSchema,
    kind: z.literal("sendText"),
    number: z.string().min(10).max(20),
    text: z.string().max(16_000).optional(),
  }),
  z.object({
    connectionId: uuidSchema,
    kind: z.literal("sendTemplate"),
    number: z.string().min(10).max(20),
    templateName: z.string().max(120).optional(),
    templateLanguage: z.string().max(20).optional(),
    templateBodyParameters: z.array(z.string().max(1024)).max(20).optional(),
  }),
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const originBlock = validateBrowserOrigin(req);
  if (originBlock) return originBlock;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 64 * 1024, schema: BodySchema });
    if (!parsedReq.ok) return parsedReq.response;

    const body = parsedReq.data;
    const { connectionId, kind } = body;

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const perUserLimit = await checkDistributedRateLimit(admin, `meta-wa-send:user:${user.id}`, 60, 60_000);
    if (!perUserLimit.allowed) {
      return rateLimitedResponseWithRetry(perUserLimit.retryAfterSeconds);
    }
    const { data: conn, error: connErr } = await admin
      .from("whatsapp_connections")
      .select(
        "id, user_id, store_id, provider, meta_phone_number_id, meta_access_token, meta_api_version",
      )
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (connErr || !conn) return errorResponse("Conexão não encontrada", 404);
    const storeId = (conn as { store_id?: string | null }).store_id ?? "";
    const storeCap = Math.min(500, Math.max(10, Number(Deno.env.get("META_WA_SEND_PER_STORE_PER_MIN") ?? "120") || 120));
    if (storeId) {
      const storeLimit = await checkDistributedRateLimit(
        admin,
        `meta-wa-send:store:${storeId}`,
        storeCap,
        60_000,
      );
      if (!storeLimit.allowed) {
        return rateLimitedResponseWithRetry(storeLimit.retryAfterSeconds);
      }
    }
    if ((conn as { provider?: string }).provider !== "meta_cloud") {
      return errorResponse("Esta conexão não é Meta Cloud API", 400);
    }

    const phoneId = (conn as { meta_phone_number_id?: string | null }).meta_phone_number_id;
    const token = (conn as { meta_access_token?: string | null }).meta_access_token;
    const apiVer = (conn as { meta_api_version?: string | null }).meta_api_version ?? "v21.0";
    if (!phoneId?.trim() || !token?.trim()) {
      return errorResponse("Meta não configurado para esta conexão", 400);
    }

    if (kind === "verify") {
      try {
        const info = await metaGraphFetchPhoneNumber(phoneId, token, apiVer);
        const { error: upErr } = await admin
          .from("whatsapp_connections")
          .update({
            phone_number: info.display_phone_number ?? null,
            status: "connected",
            connected_at: new Date().toISOString(),
            health_status: "healthy",
            health_details: {
              verified_name: info.verified_name,
              quality_rating: info.quality_rating,
              api_version: apiVer,
            },
            last_health_check_at: new Date().toISOString(),
          })
          .eq("id", connectionId)
          .eq("user_id", user.id);
        
        if (upErr) throw upErr;

        return new Response(
          JSON.stringify({
            ok: true as const,
            data: {
              display_phone_number: info.display_phone_number,
              verified_name: info.verified_name,
              quality_rating: info.quality_rating,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        const isAuthErr = String(err).includes("401") || String(err).includes("token");
        await admin
          .from("whatsapp_connections")
          .update({
            status: "error",
            health_status: isAuthErr ? "unauthorized" : "degraded",
            health_details: { error: String(err) },
            last_health_check_at: new Date().toISOString(),
          })
          .eq("id", connectionId)
          .eq("user_id", user.id);
        
        return new Response(JSON.stringify({ ok: false as const, error: String(err) }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let data: { messages?: Array<{ id?: string }> };
    if (kind === "sendText") {
      const text = body.text ?? "";
      if (!text.trim()) return errorResponse("text obrigatório", 400);
      try {
        data = await metaGraphSendText(phoneId, token, body.number, text, apiVer);
      } catch (first) {
        const { retryable } = metaErrorRetryHint(first);
        if (!retryable) throw first;
        await sleep(800);
        data = await metaGraphSendText(phoneId, token, body.number, text, apiVer);
      }
    } else {
      const name = body.templateName?.trim();
      if (!name) return errorResponse("templateName obrigatório", 400);
      try {
        data = await metaGraphSendTemplate(
          phoneId,
          token,
          body.number,
          name,
          body.templateLanguage ?? "pt_BR",
          body.templateBodyParameters ?? [],
          apiVer,
        );
      } catch (first) {
        const { retryable } = metaErrorRetryHint(first);
        if (!retryable) throw first;
        await sleep(800);
        data = await metaGraphSendTemplate(
          phoneId,
          token,
          body.number,
          name,
          body.templateLanguage ?? "pt_BR",
          body.templateBodyParameters ?? [],
          apiVer,
        );
      }
    }

    const mid = data.messages?.[0]?.id;
    return new Response(
      JSON.stringify({
        ok: true as const,
        data: {
          key: mid ? { id: mid, remoteJid: "", fromMe: true } : undefined,
          messageId: mid,
          status: "sent",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
