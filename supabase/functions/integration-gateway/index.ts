/**
 * LTV Boost v4 — Integration Gateway
 *
 * Generic webhook entry point for all e-commerce platforms.
 * Normalizes the raw payload before enqueuing so the downstream worker
 * (process-scheduled-messages) always receives flat, typed fields.
 *
 * Endpoint: POST /functions/v1/integration-gateway?platform=shopify&loja_id=UUID
 *
 * Auth: x-webhook-secret = INTEGRATION_GATEWAY_SECRET
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  checkDistributedRateLimit,
  errorResponse,
  getClientIp,
  rateLimitedResponseWithRetry,
  timingSafeEqual,
} from "../_shared/edge-utils.ts";
import { detectSource, normalizePayload } from "../_shared/normalize-webhook.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

const QueryParamsSchema = z.object({
  platform: z.enum(["shopify", "nuvemshop", "vtex", "woocommerce", "tray", "yampi", "magento", "shopee", "custom"]),
  loja_id: z.string().uuid("loja_id deve ser UUID válido"),
});

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const expectedSecret = Deno.env.get("INTEGRATION_GATEWAY_SECRET") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // ── Query params ────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const paramsResult = QueryParamsSchema.safeParse({
    platform: url.searchParams.get("platform")?.toLowerCase(),
    loja_id: url.searchParams.get("loja_id"),
  });
  if (!paramsResult.success) {
    return new Response(JSON.stringify({ error: "Parâmetros inválidos", details: paramsResult.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { platform: declaredPlatform, loja_id: storeId } = paramsResult.data;

  // ── Read body ───────────────────────────────────────────────────────────────
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 256 * 1024) {
    return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: cors });
  }

  let rawBody: Uint8Array;
  let rawPayload: unknown;
  try {
    rawBody = new Uint8Array(await req.arrayBuffer());
    rawPayload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // ── Supabase + rate limit ───────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ip = getClientIp(req);
  const limit = await checkDistributedRateLimit(supabase, `gateway:${storeId}:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) return rateLimitedResponseWithRetry(limit.retryAfterSeconds);

  try {
    // ── Resolve store owner ──────────────────────────────────────────────────
    const { data: store } = await supabase.from("stores").select("user_id").eq("id", storeId).single();
    if (!store?.user_id) return errorResponse("Store not found", 404);

    // ── Detect actual platform from payload (use declared as hint if detection fails) ──
    const detectedPlatform = detectSource(req, rawPayload);
    const platform = detectedPlatform !== "custom" ? detectedPlatform : declaredPlatform;

    // ── Normalize payload ────────────────────────────────────────────────────
    // Critical: normalize BEFORE enqueuing so the worker receives typed fields.
    // Previously this stored raw payload, causing 100% dead-letter rate.
    const normalized = normalizePayload(platform, rawPayload);

    // ── Enqueue normalized payload ───────────────────────────────────────────
    const externalId = String(normalized.external_id || "");
    const upsertPayload = {
      store_id: storeId,
      user_id: store.user_id,
      platform,
      payload_normalized: normalized as Record<string, unknown>,
      status: "pending",
      ...(externalId ? { external_id: externalId } : {}),
    };

    const { error: queueErr } = externalId
      ? await supabase.from("webhook_queue").upsert(upsertPayload, {
          onConflict: "store_id,external_id",
          ignoreDuplicates: true,
        })
      : await supabase.from("webhook_queue").insert(upsertPayload);

    if (queueErr) throw queueErr;

    console.log(
      `[${requestId}] gateway enqueued platform=${platform} (declared=${declaredPlatform}) store=${storeId} elapsed_ms=${Date.now() - startedAt}`,
    );

    return new Response(
      JSON.stringify({ success: true, message: "Accepted for processing", request_id: requestId }),
      { status: 202, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const err = e as Error;
    console.error(`[${requestId}] Gateway Error:`, err.message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
