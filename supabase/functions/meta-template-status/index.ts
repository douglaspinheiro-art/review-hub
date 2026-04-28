/**
 * Webhook Meta — atualizações de status de templates (`message_template_status_update`,
 * `message_template_quality_update`, `message_template_components_update`).
 *
 * Configure no painel Meta (WhatsApp Business Account → Webhooks) apontando para esta
 * função e assinando os campos acima. Verificação GET via `META_WHATSAPP_VERIFY_TOKEN`,
 * payloads POST validados com HMAC `x-hub-signature-256` usando `META_APP_SECRET`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireSecrets } from "../_shared/require-secrets.ts";
import { corsHeaders as _baseCors } from "../_shared/edge-utils.ts";

const cors = {
  ..._baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

async function verifyMetaSignature(body: string, signatureHeader: string, appSecret: string): Promise<boolean> {
  if (!appSecret || !signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const actualHex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return actualHex === expectedHex;
}

function normalizeStatus(s: string | undefined): string {
  const v = (s ?? "").toLowerCase();
  if (["approved", "rejected", "pending", "paused", "disabled", "in_appeal", "pending_deletion", "deleted"].includes(v)) {
    return v;
  }
  return "pending";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const secretsCheck = requireSecrets(["META_WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"], "meta-template-status");
  if (secretsCheck) return secretsCheck;

  const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN")!;
  const appSecret = Deno.env.get("META_APP_SECRET")!;

  if (req.method === "GET") {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: cors });
    }
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors });
  }

  if (!appSecret) {
    console.error("[meta-template-status] META_APP_SECRET is not configured — rejecting request");
    return new Response(JSON.stringify({ error: "Service misconfigured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";

  if (!(await verifyMetaSignature(rawBody, sig, appSecret))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let processed = 0;
  let failed = 0;

  try {
    const entries = (body.entry as unknown[]) ?? [];
    for (const ent of entries) {
      const wabaId = String((ent as Record<string, unknown>).id ?? "");
      const changes = ((ent as Record<string, unknown>).changes as unknown[]) ?? [];
      for (const ch of changes) {
        const change = ch as Record<string, unknown>;
        const field = String(change.field ?? "");
        const value = (change.value ?? {}) as Record<string, unknown>;

        if (
          field !== "message_template_status_update" &&
          field !== "message_template_quality_update" &&
          field !== "message_template_components_update"
        ) {
          continue;
        }

        const metaTemplateId = String(value.message_template_id ?? "");
        const templateName = String(value.message_template_name ?? "");
        const language = String(value.message_template_language ?? "");
        const event = String(value.event ?? "");
        const reason = value.reason ?? value.disable_info ?? null;
        const reasonStr = typeof reason === "string" ? reason : reason ? JSON.stringify(reason) : null;

        if (!metaTemplateId && !templateName) continue;

        const updates: Record<string, unknown> = {
          meta_synced_at: new Date().toISOString(),
        };

        if (field === "message_template_status_update") {
          updates.status = normalizeStatus(event);
          updates.meta_rejection_reason = updates.status === "rejected" ? (reasonStr?.slice(0, 500) ?? null) : null;
        } else if (field === "message_template_quality_update") {
          updates.meta_quality_score = String(value.new_quality_score ?? value.previous_quality_score ?? "").slice(0, 50);
        } else if (field === "message_template_components_update") {
          updates.meta_components_updated_at = new Date().toISOString();
        }

        // Match by meta_template_id first; fallback to (name + language) within the WABA's connections.
        let q = supabase.from("whatsapp_templates").update(updates);
        if (metaTemplateId) {
          q = q.eq("meta_template_id", metaTemplateId);
        } else {
          q = q.eq("name", templateName).eq("language", language);
        }
        const { error } = await q;
        if (error) {
          failed += 1;
          console.error("[meta-template-status] update failed", { metaTemplateId, templateName, language, error: error.message });
          await supabase.from("webhook_logs").insert({
            type: "meta_template_status",
            payload: { wabaId, field, value },
            status: "failed",
            error_message: error.message,
          }).then(() => {/* ignore secondary */});
        } else {
          processed += 1;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, failed }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[meta-template-status]", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});