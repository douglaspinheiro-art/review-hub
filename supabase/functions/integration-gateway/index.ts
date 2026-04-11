import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  checkDistributedRateLimit,
  errorResponse,
  getClientIp,
  rateLimitedResponseWithRetry,
} from "../_shared/edge-utils.ts";
import { validateRequest } from "../_shared/validation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120; // Increased for queue mode

// --- Zod Schemas (Shared with normalization) ---
const QueryParamsSchema = z.object({
  platform: z.enum(["shopify", "nuvemshop", "vtex", "woocommerce", "tray", "yampi", "shopee", "custom"]),
  loja_id: z.string().uuid("loja_id deve ser UUID válido"),
});

// (Simplified schemas for normalization in gateway - full schemas in worker)
const GenericOrderSchema = z.record(z.any());

// --- Main Handler (Refactored for Queueing) ---
serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  
  const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 256 * 1024 });
  if (!parsedReq.ok) return parsedReq.response;

  const expectedSecret = Deno.env.get("INTEGRATION_GATEWAY_SECRET") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const url = new URL(req.url);
  const paramsResult = QueryParamsSchema.safeParse({
    platform: url.searchParams.get("platform")?.toLowerCase(),
    loja_id: url.searchParams.get("loja_id"),
  });

  if (!paramsResult.success) {
    return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { platform, loja_id: storeId } = paramsResult.data;

  // Rate Limiting (Fast)
  const ip = getClientIp(req);
  const limit = await checkDistributedRateLimit(supabase, `gateway:${storeId}:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) return rateLimitedResponseWithRetry(limit.retryAfterSeconds);

  try {
    const rawBody = await req.json();
    
    // Get store owner
    const { data: store } = await supabase.from("stores").select("user_id").eq("id", storeId).single();
    if (!store?.user_id) return errorResponse("Store not found", 404);

    // ─── ENQUEUE LOG & PAYLOAD ──────────────────────────────────────────
    // We log the raw payload and normalized structure into the queue
    // Note: In a real implementation, normalization logic from original file 
    // would be called here or moved to the worker. 
    // To keep it simple and FAST, we enqueue the raw payload + platform info.
    
    const { error: queueErr } = await supabase.from("webhook_queue").insert({
      store_id: storeId,
      user_id: store.user_id,
      platform,
      payload_normalized: {
        raw: rawBody,
        meta: {
          ip,
          received_at: new Date().toISOString(),
          request_id: requestId
        }
      },
      status: "pending"
    });

    if (queueErr) throw queueErr;

    console.log(`[${requestId}] Enqueued webhook platform=${platform} store=${storeId} elapsed_ms=${Date.now() - startedAt}`);
    
    return new Response(
      JSON.stringify({ success: true, message: "Accepted for processing", request_id: requestId }),
      { status: 202, headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (e) {
    const err = e as Error;
    console.error(`[${requestId}] Gateway Error:`, err.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
