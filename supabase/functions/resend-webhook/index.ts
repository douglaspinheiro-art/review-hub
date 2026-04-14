/**
 * resend-webhook — Suprime e-mails com bounce/complaint (Resend → Supabase)
 *
 * Configure no Resend o endpoint POST com header ou query secret.
 * Body exemplo: { "type": "email.bounced", "data": { "to": ["x@y.com"], "tags": [{ "name": "user_id", "value": "uuid" }] } }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

function tagMap(tags: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(tags)) return out;
  for (const t of tags) {
    if (t && typeof t === "object" && "name" in t && "value" in t) {
      out[String((t as { name: string }).name)] = String((t as { value: string }).value);
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // RESEND_WEBHOOK_SECRET is mandatory — reject all requests if not configured
  // to prevent unauthorized writes to customers_v3.
  if (!RESEND_WEBHOOK_SECRET) {
    console.error("resend-webhook: RESEND_WEBHOOK_SECRET is not configured");
    return new Response("Service unavailable", { status: 503 });
  }

  const q = new URL(req.url).searchParams.get("secret");
  const header = req.headers.get("x-webhook-secret");
  if (q !== RESEND_WEBHOOK_SECRET && header !== RESEND_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const type = String(payload?.type ?? "");
    const eventId = String(payload?.id ?? payload?.created_at ?? "");
    const data = payload?.data ?? {};
    const toRaw = data.to ?? data.email ?? [];
    const email = Array.isArray(toRaw) ? toRaw[0] : String(toRaw || "");
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const tags = tagMap(data.tags);
    const userId = tags.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no user_id tag" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Idempotency: skip if this event was already processed
    if (eventId) {
      const { error: dedupError } = await sb.from("resend_webhook_events").insert({
        event_id: eventId,
        type,
      });
      if (dedupError?.code === "23505") {
        // Already processed — return 200 so Resend stops retrying
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const patch: Record<string, string> = {};
    if (type.includes("bounced") || type.includes("hard_bounce") || type === "email.bounced") {
      patch.email_hard_bounce_at = new Date().toISOString();
    }
    if (type.includes("complained") || type === "email.complained") {
      patch.email_complaint_at = new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ ok: true, ignored: type }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    await sb
      .from("customers_v3")
      .update(patch as never)
      .eq("user_id", userId)
      .ilike("email", email);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("resend-webhook error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
});
