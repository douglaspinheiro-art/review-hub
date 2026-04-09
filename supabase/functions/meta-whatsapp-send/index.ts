/**
 * Proxy autenticado para envio WhatsApp Cloud API (Meta) — token só no edge.
 * O browser chama com JWT; Evolution continua usando evolution-proxy.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  errorResponse,
  validateBrowserOrigin,
  checkRateLimit,
  getClientIp,
  z,
} from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";
import { metaGraphSendText, metaGraphSendTemplate } from "../_shared/meta-graph-send.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z.object({
  connectionId: uuidSchema,
  kind: z.enum(["sendText", "sendTemplate"]),
  number: z.string().min(10).max(20),
  text: z.string().max(16_000).optional(),
  templateName: z.string().max(120).optional(),
  templateLanguage: z.string().max(20).optional(),
  templateBodyParameters: z.array(z.string().max(1024)).max(20).optional(),
});

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

    const {
      connectionId,
      kind,
      number,
      text = "",
      templateName,
      templateLanguage = "pt_BR",
      templateBodyParameters = [],
    } = parsedReq.data;

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const ip = getClientIp(req);
    if (!checkRateLimit(`meta-wa-send:${user.id}:${ip}`, 60, 60_000)) {
      return errorResponse("Rate limited", 429);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: conn, error: connErr } = await admin
      .from("whatsapp_connections")
      .select(
        "id, user_id, provider, meta_phone_number_id, meta_access_token, meta_api_version",
      )
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (connErr || !conn) return errorResponse("Conexão não encontrada", 404);
    if ((conn as { provider?: string }).provider !== "meta_cloud") {
      return errorResponse("Esta conexão não é Meta Cloud API", 400);
    }

    const phoneId = (conn as { meta_phone_number_id?: string | null }).meta_phone_number_id;
    const token = (conn as { meta_access_token?: string | null }).meta_access_token;
    const apiVer = (conn as { meta_api_version?: string | null }).meta_api_version ?? "v21.0";
    if (!phoneId?.trim() || !token?.trim()) {
      return errorResponse("Meta não configurado para esta conexão", 400);
    }

    let data: { messages?: Array<{ id?: string }> };
    if (kind === "sendText") {
      if (!text.trim()) return errorResponse("text obrigatório", 400);
      data = await metaGraphSendText(phoneId, token, number, text, apiVer);
    } else {
      const name = templateName?.trim();
      if (!name) return errorResponse("templateName obrigatório", 400);
      data = await metaGraphSendTemplate(
        phoneId,
        token,
        number,
        name,
        templateLanguage,
        templateBodyParameters,
        apiVer,
      );
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
