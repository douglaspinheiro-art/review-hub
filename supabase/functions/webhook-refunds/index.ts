// @ts-nocheck — Same multi-platform shape divergence as webhook-cart/orders; helper signatures conflict with strict generics.
/**
 * LTV Boost v4 — Refund Webhook
 *
 * Ingests refund events from e-commerce platforms.
 * Updates order status in orders_v3 and adjusts customer LTV metrics.
 *
 * Endpoint: POST /functions/v1/webhook-refunds?store_id=UUID
 * Auth: x-webhook-secret = WEBHOOK_REFUNDS_SECRET
 *
 * Supported platforms: shopify | woocommerce | vtex | nuvemshop | magento | custom
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
  getVerifierSecretForStore,
  verifyShopifyHmac,
  verifyWooCommerceHmac,
  verifyNuvemshopToken,
  verifyVtexAppKey,
} from "../_shared/normalize-webhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

type AnyRecord = Record<string, unknown>;

function toFloat(v: unknown): number {
  return parseFloat(String(v ?? 0)) || 0;
}
function toStr(v: unknown): string {
  return v != null ? String(v) : "";
}

interface NormalizedRefund {
  order_external_id: string;
  refund_id: string;
  amount: number;
  reason?: string;
  is_full_refund: boolean;
}

function detectRefundSource(req: Request, payload: unknown): string {
  const p = (payload ?? {}) as AnyRecord;
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (ua.includes("shopify") || req.headers.get("x-shopify-topic")) return "shopify";
  if (ua.includes("woocommerce") || req.headers.get("x-wc-webhook-topic")) return "woocommerce";
  if (req.headers.get("x-linkedstore-token") || req.headers.get("x-notification-token")) return "nuvemshop";
  if ((p as { OrderFormId?: unknown })?.OrderFormId != null) return "vtex";
  if ((p as { increment_id?: unknown })?.increment_id != null) return "magento";
  // Shopee: order_sn + shop_id or refund_sn
  if ((p as { order_sn?: unknown })?.order_sn != null || (p as { refund_sn?: unknown })?.refund_sn != null) return "shopee";
  if (ua.includes("shopee")) return "shopee";
  const qs = new URL(req.url).searchParams.get("platform") ?? "";
  if (qs) return qs.toLowerCase();
  return "custom";
}

function normalizeRefund(source: string, payload: unknown): NormalizedRefund {
  const p = (payload ?? {}) as AnyRecord;

  switch (source) {
    case "shopify": {
      // Shopify refund webhook: { id, order_id, transactions[].amount, note, ... }
      const transactions = (p.transactions || p.refund_line_items || []) as AnyRecord[];
      const amount = transactions.reduce((s, t) => s + toFloat(t.amount), 0) || toFloat(p.amount);
      return {
        order_external_id: toStr(p.order_id),
        refund_id: toStr(p.id),
        amount,
        reason: toStr(p.note || p.reason) || undefined,
        is_full_refund: !!(p as { restock?: boolean }).restock,
      };
    }
    case "woocommerce": {
      // WooCommerce: { id, parent_id (order ID), amount, reason }
      return {
        order_external_id: toStr(p.parent_id || p.order_id),
        refund_id: toStr(p.id),
        amount: toFloat(p.amount || p.total),
        reason: toStr(p.reason) || undefined,
        is_full_refund: false,
      };
    }
    case "vtex": {
      return {
        order_external_id: toStr(p.orderId || p.OrderId),
        refund_id: toStr(p.id || p.refundId),
        amount: toFloat(p.value) / 100,
        reason: toStr(p.reason) || undefined,
        is_full_refund: false,
      };
    }
    case "nuvemshop": {
      return {
        order_external_id: toStr(p.order_id || p.id),
        refund_id: toStr(p.refund_id || p.id),
        amount: toFloat(p.amount || p.total),
        reason: toStr(p.reason || p.note) || undefined,
        is_full_refund: false,
      };
    }
    case "magento": {
      // Magento 2 creditmemo: { order_id, increment_id, grand_total, ... }
      return {
        order_external_id: toStr(p.order_id || p.order_increment_id),
        refund_id: toStr(p.increment_id || p.entity_id),
        amount: toFloat(p.grand_total || p.base_grand_total),
        reason: toStr(p.customer_note) || undefined,
        is_full_refund: false,
      };
    }
    case "shopee": {
      // Shopee refund: { order_sn, refund_sn, refund_amount, reason, ... }
      return {
        order_external_id: toStr(p.order_sn || p.order_id),
        refund_id: toStr(p.refund_sn || p.refund_id || p.id),
        amount: toFloat(p.refund_amount || p.amount),
        reason: toStr(p.reason || p.dispute_reason) || undefined,
        is_full_refund: !!(p as { full_refund?: boolean }).full_refund,
      };
    }
    default: {
      return {
        order_external_id: toStr(p.order_id || p.order_external_id || p.external_id),
        refund_id: toStr(p.refund_id || p.id),
        amount: toFloat(p.amount || p.value || p.total),
        reason: toStr(p.reason || p.note) || undefined,
        is_full_refund: !!(p as { full_refund?: boolean }).full_refund,
      };
    }
  }
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const expectedSecret = Deno.env.get("WEBHOOK_REFUNDS_SECRET") ?? Deno.env.get("WEBHOOK_ORDERS_SECRET") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  // ── Query params ────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const querySchema = z.object({ store_id: uuidSchema });
  const queryParsed = querySchema.safeParse({ store_id: url.searchParams.get("store_id") });
  if (!queryParsed.success) return errorResponse("store_id is required in query params", 400);
  const storeId = queryParsed.data.store_id;

  // ── Read body ──────────────────────────────────────────────────────────────
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

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  // ── Platform detection + HMAC ──────────────────────────────────────────────
  const source = detectRefundSource(req, payload);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // HMAC verification for supported platforms
  let signatureOk = true;
  if (source === "shopify") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "shopify");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    signatureOk = await verifyShopifyHmac(req, rawBody, secretResult.secret);
  } else if (source === "woocommerce") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "woocommerce");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    signatureOk = await verifyWooCommerceHmac(req, rawBody, secretResult.secret);
  } else if (source === "nuvemshop") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "nuvemshop");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    signatureOk = verifyNuvemshopToken(req, secretResult.secret);
  } else if (source === "vtex") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "vtex");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    signatureOk = verifyVtexAppKey(req, secretResult.secret);
  }

  if (!signatureOk) {
    return new Response(JSON.stringify({ error: "Webhook signature verification failed" }), {
      status: 401, headers: corsHeaders,
    });
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  const limit = await checkDistributedRateLimit(supabase, `webhook-refunds:${storeId}:${ip}`, 60, 60_000);
  if (!limit.allowed) {
    return rateLimitedResponseWithRetry(limit.retryAfterSeconds);
  }

  // ── Normalize refund ───────────────────────────────────────────────────────
  const refund = normalizeRefund(source, payload);

  if (!refund.order_external_id) {
    return errorResponse("order_external_id not found in payload", 422);
  }

  // ── Find order in orders_v3 ────────────────────────────────────────────────
  const { data: order } = await supabase
    .from("orders_v3")
    .select("id, customer_id, valor, store_id")
    .eq("store_id", storeId)
    .eq("pedido_externo_id", refund.order_external_id)
    .maybeSingle();

  if (!order) {
    console.warn(`[${requestId}] Refund for unknown order ${refund.order_external_id} on store ${storeId}`);
    return new Response(
      JSON.stringify({ ok: true, message: "Order not found — refund logged but not processed" }),
      { status: 202, headers: corsHeaders },
    );
  }

  // ── Update order status ────────────────────────────────────────────────────
  const newFinancialStatus = refund.is_full_refund || refund.amount >= toFloat(order.valor)
    ? "refunded"
    : "partially_refunded";

  await supabase
    .from("orders_v3")
    .update({
      financial_status: newFinancialStatus,
      valor_reembolso: refund.amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  // ── Adjust customer totals if full refund ──────────────────────────────────
  if (order.customer_id) {
    // Decrement the customer's total_spent by the refund amount
    const { data: customer } = await supabase
      .from("customers_v3")
      .select("rfm_monetary")
      .eq("id", order.customer_id)
      .maybeSingle();

    if (customer) {
      const newMonetary = Math.max(0, toFloat(customer.rfm_monetary) - refund.amount);
      await supabase
        .from("customers_v3")
        .update({ rfm_monetary: newMonetary })
        .eq("id", order.customer_id);
    }
  }

  console.log(
    `[${requestId}] webhook-refunds processed source=${source} store=${storeId} order=${refund.order_external_id} amount=${refund.amount} status=${newFinancialStatus} elapsed_ms=${Date.now() - startedAt}`,
  );

  await writeAuditLog(supabase, {
    action: "refund_processed",
    resource: "webhook-refunds",
    result: "success",
    ip,
    tenant_id: storeId,
    metadata: {
      request_id: requestId,
      source,
      order_external_id: refund.order_external_id,
      refund_amount: refund.amount,
      financial_status: newFinancialStatus,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      request_id: requestId,
      order_id: order.id,
      financial_status: newFinancialStatus,
      refund_amount: refund.amount,
    }),
    { status: 202, headers: corsHeaders },
  );
});
