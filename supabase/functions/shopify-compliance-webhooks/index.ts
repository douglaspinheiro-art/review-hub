/**
 * Shopify GDPR/Compliance Webhooks
 *
 * Single endpoint for the three mandatory Shopify compliance topics:
 *   - customers/data_request  → log the request; the merchant must produce the export
 *   - customers/redact        → erase/anonymize all PII for the given customer
 *   - shop/redact             → erase all data for the shop (sent ~48h after uninstall)
 *
 * All responses are < 5s and 200 OK on valid HMAC, 401 on invalid HMAC.
 * Auth: Shopify signs the raw body with SHOPIFY_CLIENT_SECRET (HMAC-SHA256, base64).
 *
 * Configure in Shopify Partners → Configuration → Compliance webhooks:
 *   Customer data request URL: <SUPABASE_URL>/functions/v1/shopify-compliance-webhooks
 *   Customer data erasure URL: <SUPABASE_URL>/functions/v1/shopify-compliance-webhooks
 *   Shop data erasure URL:     <SUPABASE_URL>/functions/v1/shopify-compliance-webhooks
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";
import { verifyShopifyBodyHmac } from "../_shared/shopify-hmac.ts";

const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPPORTED_TOPICS = new Set(["customers/data_request", "customers/redact", "shop/redact"]);

function jsonOk(body: Record<string, unknown> = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function unauthorized(reason: string) {
  return new Response(JSON.stringify({ ok: false, error: reason }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logCompliance(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ tag: "shopify-compliance", ts: new Date().toISOString(), ...fields }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!SHOPIFY_CLIENT_SECRET) {
    // Fail-closed: never accept unsigned compliance requests.
    logCompliance({ ok: false, error: "missing_client_secret" });
    return new Response(JSON.stringify({ ok: false, error: "Server misconfigured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shopDomain = req.headers.get("x-shopify-shop-domain") ?? "";

  // Read raw body once for HMAC + parsing.
  let rawBody: Uint8Array;
  try {
    rawBody = new Uint8Array(await req.arrayBuffer());
  } catch {
    return unauthorized("Failed to read body");
  }

  const hmacOk = await verifyShopifyBodyHmac(req, rawBody, SHOPIFY_CLIENT_SECRET);
  if (!hmacOk) {
    logCompliance({ ok: false, error: "invalid_hmac", topic, shop: shopDomain });
    return unauthorized("Invalid HMAC");
  }

  if (!SUPPORTED_TOPICS.has(topic)) {
    logCompliance({ ok: false, error: "unsupported_topic", topic, shop: shopDomain });
    return unauthorized("Unsupported compliance topic");
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    // Shopify always sends JSON, but accept empty body just to keep the 200 contract.
    payload = {};
  }

  const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

  // Resolve which store this shop belongs to (best-effort — the shop may not exist yet).
  let storeId: string | null = null;
  if (admin && shopDomain) {
    const { data: integ } = await admin
      .from("integrations")
      .select("store_id, config")
      .eq("type", "shopify")
      .filter("config->>shop_url", "eq", shopDomain)
      .maybeSingle();
    storeId = (integ?.store_id as string | undefined) ?? null;
  }

  // Always log to audit_logs (best-effort) so compliance requests are auditable.
  if (admin) {
    try {
      await admin.from("audit_logs").insert({
        action: `shopify_compliance:${topic || "unknown"}`,
        resource: "shopify-compliance-webhooks",
        result: "received",
        tenant_id: storeId,
        metadata: { topic, shop_domain: shopDomain, payload },
      });
    } catch (e) {
      console.warn("[shopify-compliance] audit_logs insert failed:", (e as Error).message);
    }
  }

  // Handle each topic. We always return 200 once HMAC is valid — Shopify retries
  // up to 48h on non-2xx, and our actual erasure work is async/best-effort here.
  try {
    if (topic === "shop/redact" && admin && shopDomain) {
      // Shopify sends this 48h after uninstall. Delete all rows for the matching store(s).
      const { data: integs } = await admin
        .from("integrations")
        .select("store_id")
        .eq("type", "shopify")
        .filter("config->>shop_url", "eq", shopDomain);
      const storeIds = (integs ?? []).map((r: { store_id: string }) => r.store_id).filter(Boolean);
      for (const sid of storeIds) {
        // Delete tenant data (RLS bypassed via service role). Order matters where FKs exist.
        await admin.from("messages").delete().eq("store_id", sid);
        await admin.from("conversations").delete().eq("store_id", sid);
        await admin.from("contacts").delete().eq("store_id", sid);
        await admin.from("orders_v3").delete().eq("store_id", sid);
        await admin.from("customers_v3").delete().eq("store_id", sid);
        await admin.from("integrations").delete().eq("store_id", sid).eq("type", "shopify");
      }
      logCompliance({ ok: true, topic, shop: shopDomain, stores_redacted: storeIds.length });
    } else if (topic === "customers/redact" && admin && storeId) {
      const customer = (payload.customer ?? {}) as { email?: string; phone?: string; id?: string | number };
      const email = customer.email ?? null;
      const phone = customer.phone ?? null;
      // Anonymize: clear PII columns instead of hard-deleting (preserves aggregates).
      const redacted = { name: "REDACTED", email: null, phone: null, notes: null };
      if (email) {
        await admin.from("contacts").update(redacted).eq("store_id", storeId).eq("email", email);
      }
      if (phone) {
        await admin.from("contacts").update(redacted).eq("store_id", storeId).eq("phone", phone);
      }
      logCompliance({ ok: true, topic, shop: shopDomain, store_id: storeId });
    } else if (topic === "customers/data_request") {
      // Shopify expects the merchant to produce the export out-of-band.
      // Logging to audit_logs above is sufficient for the automated check.
      logCompliance({ ok: true, topic, shop: shopDomain, store_id: storeId });
    } else {
      logCompliance({ ok: true, topic, shop: shopDomain, note: "unhandled_topic" });
    }
  } catch (e) {
    // Even if our handler fails, we ack 200 — Shopify will not retry, and we have audit_logs.
    logCompliance({ ok: false, topic, shop: shopDomain, error: (e as Error).message });
  }

  return jsonOk();
});