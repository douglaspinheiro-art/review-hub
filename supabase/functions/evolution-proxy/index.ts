/**
 * Proxy autenticado para Evolution API — evita CORS no browser e mantém chamadas
 * com a ApiKey no edge. Requer JWT de usuário + connectionId da tabela whatsapp_connections.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  z,
  corsHeaders,
  errorResponse,
  validateBrowserOrigin,
  checkRateLimit,
  getClientIp,
} from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z.object({
  connectionId: uuidSchema,
  action: z.enum([
    "connect",
    "connectionState",
    "create",
    "delete",
    "setWebhook",
    "messageRequest",
  ]),
  payload: z.any().optional(),
});

const MessageRequestSchema = z.object({
  subpath: z.enum(["sendText", "sendTemplate", "sendMedia"]),
  body: z.record(z.string(), z.any()),
});

function evoHeaders(apiKey: string, withJson = true): HeadersInit {
  const h: Record<string, string> = { apikey: apiKey };
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

function trimBase(url: string): string {
  return url.replace(/\/$/, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const originBlock = validateBrowserOrigin(req);
  if (originBlock) return originBlock;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse("Unauthorized", 401);
    }

    const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 128 * 1024, schema: BodySchema });
    if (!parsedReq.ok) return parsedReq.response;

    const { connectionId, action, payload = {} } = parsedReq.data;

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    const ip = getClientIp(req);
    const rlKey = `${user.id}:${ip}`;
    if (!checkRateLimit(`evo-proxy:${rlKey}`, 120, 60_000)) {
      return errorResponse("Rate limited", 429);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: conn, error: connErr } = await admin
      .from("whatsapp_connections")
      .select("id, user_id, instance_name, evolution_api_url, evolution_api_key, provider")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (connErr || !conn) {
      return errorResponse("Conexão não encontrada", 404);
    }

    if ((conn as { provider?: string }).provider === "meta_cloud") {
      return new Response(
        JSON.stringify({
          ok: false as const,
          error: "Conexão Meta Cloud API: use a função meta-whatsapp-send no app, não o evolution-proxy.",
          status: 400,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const base =
      conn.evolution_api_url && conn.evolution_api_key
        ? trimBase(conn.evolution_api_url)
        : null;
    const key = conn.evolution_api_key;

    const ok = (data: unknown) =>
      new Response(JSON.stringify({ ok: true as const, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const evoErr = (status: number, message: string) =>
      new Response(JSON.stringify({ ok: false as const, error: message, status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (!base || !key) {
      return evoErr(400, "Evolution API não configurada para esta instância");
    }

    if (action === "connect") {
      const res = await fetch(`${base}/instance/connect/${encodeURIComponent(conn.instance_name)}`, {
        method: "GET",
        headers: evoHeaders(key!, false),
      });
      const text = await res.text();
      if (!res.ok) return evoErr(res.status, text || `HTTP ${res.status}`);
      try {
        return ok(JSON.parse(text));
      } catch {
        return evoErr(502, "Resposta inválida da Evolution API");
      }
    }

    if (action === "connectionState") {
      const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(conn.instance_name)}`, {
        method: "GET",
        headers: evoHeaders(key!, false),
      });
      const text = await res.text();
      if (!res.ok) return evoErr(res.status, text || `HTTP ${res.status}`);
      try {
        return ok(JSON.parse(text));
      } catch {
        return evoErr(502, "Resposta inválida da Evolution API");
      }
    }

    if (action === "create") {
      const res = await fetch(`${base}/instance/create`, {
        method: "POST",
        headers: evoHeaders(key),
        body: JSON.stringify({
          instanceName: conn.instance_name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      const text = await res.text();
      if (!res.ok) return evoErr(res.status, text || `HTTP ${res.status}`);
      try {
        return ok(JSON.parse(text));
      } catch {
        return evoErr(502, text);
      }
    }

    if (action === "delete") {
      const res = await fetch(`${base}/instance/delete/${encodeURIComponent(conn.instance_name)}`, {
        method: "DELETE",
        headers: evoHeaders(key!, false),
      });
      const text = await res.text();
      if (!res.ok && res.status !== 404) {
        return evoErr(res.status, text || `HTTP ${res.status}`);
      }
      try {
        return ok(text ? JSON.parse(text) : { deleted: true });
      } catch {
        return ok({ deleted: true, raw: text });
      }
    }

    if (action === "setWebhook") {
      const webhookUrl = typeof payload.webhookUrl === "string" ? payload.webhookUrl.trim() : "";
      if (!webhookUrl) return evoErr(400, "webhookUrl obrigatório");

      const secret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
      const webhookObj = secret
        ? {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          events: [],
          headers: { "x-webhook-secret": secret },
        }
        : { enabled: true, url: webhookUrl };

      const candidates = [
        { url: `${base}/webhook/set/${encodeURIComponent(conn.instance_name)}`, body: { webhook: webhookObj } },
        { url: `${base}/webhook/setWebhook/${encodeURIComponent(conn.instance_name)}`, body: { webhook: webhookUrl, enabled: true } },
        { url: `${base}/instance/webhook/${encodeURIComponent(conn.instance_name)}`, body: { url: webhookUrl, enabled: true } },
      ];

      let lastErr = "Não foi possível configurar webhook";
      for (const c of candidates) {
        const res = await fetch(c.url, {
          method: "POST",
          headers: evoHeaders(key!),
          body: JSON.stringify(c.body),
        });
        if (res.ok) {
          try {
            return ok(await res.json());
          } catch {
            return ok({ configured: true });
          }
        }
        lastErr = await res.text();
      }
      return evoErr(502, lastErr);
    }

    if (action === "messageRequest") {
      const mr = MessageRequestSchema.safeParse(payload);
      if (!mr.success) {
        return errorResponse("Payload messageRequest inválido", 400);
      }
      const { subpath, body: msgBody } = mr.data;
      const res = await fetch(
        `${base}/message/${subpath}/${encodeURIComponent(conn.instance_name)}`,
        {
          method: "POST",
          headers: evoHeaders(key!),
          body: JSON.stringify(msgBody),
        },
      );
      const text = await res.text();
      if (!res.ok) return evoErr(res.status, text || `HTTP ${res.status}`);
      try {
        return ok(JSON.parse(text));
      } catch {
        return evoErr(502, text);
      }
    }

    return errorResponse("Ação desconhecida", 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[evolution-proxy]", msg);
    return errorResponse("Internal error", 500);
  }
});
