/**
 * Lists APPROVED Meta WhatsApp Cloud templates for a given connection.
 * Browser → JWT auth; reads connection (RLS-style check via user_id) and queries Meta Graph
 * GET /{waba_id}/message_templates?status=APPROVED
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  errorResponse,
  validateBrowserOrigin,
  z,
} from "../_shared/edge-utils.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z.object({ connectionId: uuidSchema });

type MetaTemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  example?: Record<string, unknown>;
};

type MetaTemplate = {
  name: string;
  language: string;
  status: string;
  category: string;
  components?: MetaTemplateComponent[];
};

function countBodyVariables(components: MetaTemplateComponent[] | undefined): number {
  if (!components) return 0;
  const body = components.find((c) => c.type?.toUpperCase() === "BODY");
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\s*\d+\s*\}\}/g);
  return matches ? matches.length : 0;
}

function bodyText(components: MetaTemplateComponent[] | undefined): string {
  if (!components) return "";
  return components.find((c) => c.type?.toUpperCase() === "BODY")?.text ?? "";
}

serve(async (req) => {
  const originBlock = validateBrowserOrigin(req);
  if (originBlock) return originBlock;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return errorResponse("Unauthorized", 401);

    const parsed = await validateRequest(req, { method: "POST", maxBytes: 4 * 1024, schema: BodySchema });
    if (!parsed.ok) return parsed.response;

    const { connectionId } = parsed.data;
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return errorResponse("Unauthorized", 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: conn, error: connErr } = await admin
      .from("whatsapp_connections")
      .select("id, user_id, provider, meta_waba_id, meta_access_token, meta_api_version")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn) return errorResponse("Connection not found", 404);
    const c = conn as {
      provider?: string;
      meta_waba_id?: string | null;
      meta_access_token?: string | null;
      meta_api_version?: string | null;
    };
    if (c.provider !== "meta_cloud") return errorResponse("Connection is not Meta Cloud", 400);
    if (!c.meta_waba_id?.trim() || !c.meta_access_token?.trim()) {
      return errorResponse(
        "WABA ID or access token missing. Reconnect WhatsApp via Meta Embedded Signup to fetch templates.",
        400,
      );
    }

    const apiVer = (c.meta_api_version ?? "v21.0").replace(/^v?/, "v");
    const url =
      `https://graph.facebook.com/${apiVer}/${c.meta_waba_id}/message_templates?status=APPROVED&limit=100&fields=name,language,status,category,components`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${c.meta_access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `Meta Graph error ${res.status}: ${JSON.stringify(json)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const items = Array.isArray((json as { data?: unknown }).data)
      ? ((json as { data: MetaTemplate[] }).data)
      : [];

    const templates = items.map((t) => ({
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      body_text: bodyText(t.components),
      variable_count: countBodyVariables(t.components),
    }));

    return new Response(
      JSON.stringify({ ok: true, data: { templates } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
