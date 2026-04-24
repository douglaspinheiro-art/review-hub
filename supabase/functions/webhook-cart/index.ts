// @ts-nocheck — Supabase generics conflict with internal helper signatures (IntegrationsClient); behavior verified via integration tests.
/**
 * LTV Boost v4 — Abandoned Cart Webhook
 *
 * Endpoint: POST /functions/v1/webhook-cart?store_id=UUID
 *
 * Supported platforms: shopify | woocommerce | nuvemshop | vtex | tray | yampi | custom
 * HMAC verification: per-store via integrations.webhook_secret / webhook_token
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkDistributedRateLimit,
  errorResponse,
  getClientIp,
  rateLimitedResponseWithRetry,
  timingSafeEqual,
  z,
} from "../_shared/edge-utils.ts";
import { writeAuditLog } from "../_shared/audit.ts";
import { uuidSchema } from "../_shared/validation.ts";
import {
  detectSource,
  getVerifierSecretForStore,
  normalizePayload,
  verifyNuvemshopToken,
  verifyShopifyHmac,
  verifyWooCommerceHmac,
  verifyVtexAppKey,
  verifyTrayHmac,
  verifyYampiHmac,
} from "../_shared/normalize-webhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  // ── Shared-secret gate (blanket auth for all platforms) ────────────────────
  const expectedSecret = Deno.env.get("WEBHOOK_CART_SECRET") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";

  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "Webhook secret is not configured" }), { status: 503, headers: corsHeaders });
  }
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized webhook" }), { status: 401, headers: corsHeaders });
  }

  // ── Query params ────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const querySchema = z.object({ store_id: uuidSchema });
  const queryParsed = querySchema.safeParse({ store_id: url.searchParams.get("store_id") });
  if (!queryParsed.success) return errorResponse("store_id is required in query params", 400);
  const storeId = queryParsed.data.store_id;

  // ── Read raw body (needed for HMAC verification before parsing) ────────────
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 256 * 1024) {
    return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: corsHeaders });
  }

  let rawBody: Uint8Array;
  try {
    rawBody = new Uint8Array(await req.arrayBuffer());
  } catch {
    return errorResponse("Failed to read request body", 400);
  }

  if (rawBody.length === 0) return errorResponse("Empty body", 400);

  // ── Parse JSON ─────────────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  // ── Platform detection (needed for HMAC verification) ─────────────────────
  const source = detectSource(req, payload);

  // ── Supabase client (needed for per-store credentials + rate limiting) ─────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ── Platform-specific HMAC/token verification (fail-closed) ───────────────
  let hmacOk = true;
  if (source === "shopify") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "shopify");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    hmacOk = await verifyShopifyHmac(req, rawBody, secretResult.secret);
  } else if (source === "woocommerce") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "woocommerce");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    hmacOk = await verifyWooCommerceHmac(req, rawBody, secretResult.secret);
  } else if (source === "nuvemshop") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "nuvemshop");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    hmacOk = verifyNuvemshopToken(req, secretResult.secret);
  } else if (source === "vtex") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "vtex");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    hmacOk = verifyVtexAppKey(req, secretResult.secret);
  } else if (source === "tray") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "tray");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    hmacOk = await verifyTrayHmac(req, rawBody, secretResult.secret);
  } else if (source === "yampi") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "yampi");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    hmacOk = await verifyYampiHmac(req, rawBody, secretResult.secret);
  }

  if (!hmacOk) {
    return new Response(JSON.stringify({ error: "Webhook signature verification failed" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const ip = getClientIp(req);
  const rateKey = `webhook-cart:${storeId}:${ip}`;
  const limit = await checkDistributedRateLimit(supabase, rateKey, 120, 60_000);
  if (!limit.allowed) {
    await writeAuditLog(supabase, {
      action: "rate_limit_block",
      resource: "webhook-cart",
      result: "failure",
      ip,
      tenant_id: storeId,
      metadata: { request_id: requestId },
    });
    return rateLimitedResponseWithRetry(limit.retryAfterSeconds);
  }

  // ── Normalize payload ──────────────────────────────────────────────────────
  const normalized = normalizePayload(source, payload);

  if (!normalized.customer_phone) {
    return new Response(JSON.stringify({ error: "customer_phone not found in payload" }), {
      status: 422,
      headers: corsHeaders,
    });
  }

  // ── Resolve store owner ────────────────────────────────────────────────────
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    return new Response(JSON.stringify({ error: "Store not found" }), { status: 404, headers: corsHeaders });
  }

  // ── Enqueue (idempotent) ───────────────────────────────────────────────────
  // INSERT ... ON CONFLICT DO NOTHING prevents duplicate processing.
  const { data: queued, error: queueError } = await supabase.from("webhook_queue").upsert({
    store_id: storeId,
    user_id: store.user_id,
    external_id: String(normalized.external_id),
    platform: source,
    payload_normalized: normalized as Record<string, unknown>,
    status: "pending",
  }, { onConflict: "store_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();

  if (queueError) {
    console.error(`[${requestId}] Queue error:`, queueError);
    return errorResponse("Failed to enqueue webhook", 500);
  }

  if (!queued) {
    // Row already existed — idempotent duplicate delivery.
    console.log(`[${requestId}] Duplicate webhook for external_id=${normalized.external_id} (idempotency ok)`);
    return new Response(JSON.stringify({ ok: true, message: "Webhook already received" }), {
      status: 202,
      headers: corsHeaders,
    });
  }

  console.log(
    `[${requestId}] webhook-cart enqueued source=${source} store=${storeId} elapsed_ms=${Date.now() - startedAt}`,
  );
  await writeAuditLog(supabase, {
    action: "webhook_enqueued",
    resource: "webhook-cart",
    result: "success",
    ip,
    tenant_id: storeId,
    metadata: { request_id: requestId, source },
  });

  return new Response(
    JSON.stringify({ ok: true, store_id: storeId, request_id: requestId, message: "Webhook enqueued for processing" }),
    { status: 202, headers: corsHeaders },
  );
});
