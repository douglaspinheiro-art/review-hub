/**
 * Sincroniza o catálogo interno `whatsapp_templates` com a Meta Cloud API.
 *
 * Para cada template do catálogo (global `store_id IS NULL` + da loja) que ainda
 * não foi sincronizado para a conexão (não existe linha equivalente com
 * `meta_template_id` para o `store_id` daquela conexão), faz POST em
 * `{waba_id}/message_templates` e persiste o status retornado.
 *
 * Auth: JWT do usuário (browser). Verifica ownership da conexão via user_id.
 * Body: { connectionId: uuid, journeyKeys?: string[] }  // se omitido, sincroniza todos pendentes
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

const BodySchema = z.object({
  connectionId: uuidSchema,
  journeyKeys: z.array(z.string().min(1).max(100)).max(50).optional(),
});

type TemplateRow = {
  id: string;
  store_id: string | null;
  journey_key: string;
  name: string;
  category: string;
  language: string;
  header_type: string | null;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: Array<{ type: string; text?: string; url?: string; phone_number?: string }> | null;
  status: string;
  meta_template_id: string | null;
};

type MetaComponent = Record<string, unknown>;

function buildExampleParams(bodyText: string): string[] {
  const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g) ?? [];
  return matches.map((_, i) => `exemplo${i + 1}`);
}

function buildComponents(t: TemplateRow): MetaComponent[] {
  const components: MetaComponent[] = [];

  if (t.header_type && t.header_content) {
    const ht = t.header_type.toUpperCase();
    if (ht === "TEXT") {
      components.push({ type: "HEADER", format: "TEXT", text: t.header_content });
    } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(ht)) {
      components.push({
        type: "HEADER",
        format: ht,
        example: { header_handle: [t.header_content] },
      });
    }
  }

  const bodyExample = buildExampleParams(t.body_text);
  const body: MetaComponent = { type: "BODY", text: t.body_text };
  if (bodyExample.length > 0) body.example = { body_text: [bodyExample] };
  components.push(body);

  if (t.footer_text) {
    components.push({ type: "FOOTER", text: t.footer_text });
  }

  if (Array.isArray(t.buttons) && t.buttons.length > 0) {
    const buttons = t.buttons
      .map((b) => {
        const type = (b.type ?? "").toUpperCase();
        if (type === "URL") {
          return { type: "URL", text: b.text ?? "Abrir", url: b.url ?? "https://example.com" };
        }
        if (type === "PHONE_NUMBER") {
          return { type: "PHONE_NUMBER", text: b.text ?? "Ligar", phone_number: b.phone_number ?? "" };
        }
        if (type === "QUICK_REPLY") {
          return { type: "QUICK_REPLY", text: b.text ?? "Responder" };
        }
        return null;
      })
      .filter(Boolean);
    if (buttons.length > 0) components.push({ type: "BUTTONS", buttons });
  }

  return components;
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

    const parsed = await validateRequest(req, {
      method: "POST",
      maxBytes: 8 * 1024,
      schema: BodySchema,
    });
    if (!parsed.ok) return parsed.response;
    const { connectionId, journeyKeys } = parsed.data;

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
      .select("id, user_id, store_id, provider, meta_waba_id, meta_access_token, meta_api_version")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn) return errorResponse("Connection not found", 404);
    const c = conn as {
      id: string;
      store_id: string | null;
      provider?: string;
      meta_waba_id?: string | null;
      meta_access_token?: string | null;
      meta_api_version?: string | null;
    };
    if (c.provider !== "meta_cloud") return errorResponse("Connection is not Meta Cloud", 400);
    if (!c.meta_waba_id?.trim() || !c.meta_access_token?.trim()) {
      return errorResponse(
        "WABA ID ou access_token ausentes. Reconecte via Meta Embedded Signup.",
        400,
      );
    }

    // Carrega catálogo: globais (store_id IS NULL) + da loja (se houver store_id)
    let q = admin
      .from("whatsapp_templates")
      .select(
        "id, store_id, journey_key, name, category, language, header_type, header_content, body_text, footer_text, buttons, status, meta_template_id",
      );
    if (c.store_id) {
      q = q.or(`store_id.is.null,store_id.eq.${c.store_id}`);
    } else {
      q = q.is("store_id", null);
    }
    if (journeyKeys && journeyKeys.length > 0) {
      q = q.in("journey_key", journeyKeys);
    }
    const { data: templates, error: tErr } = await q;
    if (tErr) return errorResponse(`Failed to load templates: ${tErr.message}`, 500);

    const apiVer = (c.meta_api_version ?? "v21.0").replace(/^v?/, "v");
    const graphUrl = `https://graph.facebook.com/${apiVer}/${c.meta_waba_id}/message_templates`;

    const results: Array<{
      journey_key: string;
      ok: boolean;
      status?: string;
      meta_template_id?: string;
      error?: string;
      skipped?: boolean;
    }> = [];

    for (const t of (templates ?? []) as TemplateRow[]) {
      // Pula se já está aprovado e tem meta_template_id
      if (t.meta_template_id && t.status === "approved") {
        results.push({ journey_key: t.journey_key, ok: true, skipped: true, status: "approved", meta_template_id: t.meta_template_id });
        continue;
      }

      const components = buildComponents(t);
      const payload = {
        name: t.name,
        language: t.language,
        category: t.category,
        components,
      };

      try {
        const res = await fetch(graphUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.meta_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({} as Record<string, unknown>));

        if (!res.ok) {
          const errMsg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
          await admin
            .from("whatsapp_templates")
            .update({
              status: "rejected",
              meta_rejection_reason: errMsg.slice(0, 500),
              meta_synced_at: new Date().toISOString(),
            })
            .eq("id", t.id);
          results.push({ journey_key: t.journey_key, ok: false, error: errMsg });
          continue;
        }

        const metaId = (json as { id?: string }).id;
        const metaStatus = ((json as { status?: string }).status ?? "PENDING").toLowerCase();
        await admin
          .from("whatsapp_templates")
          .update({
            meta_template_id: metaId ?? null,
            meta_template_name: t.name,
            status: metaStatus,
            meta_rejection_reason: null,
            meta_synced_at: new Date().toISOString(),
          })
          .eq("id", t.id);

        results.push({ journey_key: t.journey_key, ok: true, status: metaStatus, meta_template_id: metaId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ journey_key: t.journey_key, ok: false, error: msg });
      }
    }

    const summary = {
      total: results.length,
      synced: results.filter((r) => r.ok && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => !r.ok).length,
    };

    return new Response(JSON.stringify({ ok: true, summary, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});