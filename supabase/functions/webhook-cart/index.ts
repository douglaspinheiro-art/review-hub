/**
 * LTV Boost v4 — Abandoned Cart Webhook
 *
 * Endpoint: POST /functions/v1/webhook-cart?store_id=UUID
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkDistributedRateLimit,
  errorResponse,
  getClientIp,
  rateLimitedResponseWithRetry,
  z,
} from "../_shared/edge-utils.ts";
import { writeAuditLog } from "../_shared/audit.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";
import { invokeFlowEngine } from "../_shared/flow-engine-invoke.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 256 * 1024 });
  if (!parsedReq.ok) return parsedReq.response;

  const expectedSecret = Deno.env.get("WEBHOOK_CART_SECRET") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const providedBearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const isServiceCall = serviceRole && providedBearer === serviceRole;

  if (expectedSecret) {
    if (providedSecret !== expectedSecret && !isServiceCall) {
      return new Response(JSON.stringify({ error: "Unauthorized webhook" }), { status: 401, headers: corsHeaders });
    }
  } else if (!isServiceCall) {
    // Fail-closed when secret is not configured.
    return new Response(JSON.stringify({ error: "Webhook secret is not configured" }), { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const querySchema = z.object({ store_id: uuidSchema });
  const queryParsed = querySchema.safeParse({ store_id: url.searchParams.get("store_id") });
  if (!queryParsed.success) return errorResponse("store_id is required in query params", 400);
  const storeId = queryParsed.data.store_id;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

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

  // 1. Detect and Normalize
  const source = detectSource(req, payload);
  const normalized = normalizePayload(source, payload);

  if (!normalized.customer_phone) {
    return new Response(JSON.stringify({ error: "customer_phone not found" }), { status: 422, headers: corsHeaders });
  }

  // 2. Identify User/Store
  const { data: store } = await supabase.from("stores").select("user_id").eq("id", storeId).single();
  if (!store) return new Response(JSON.stringify({ error: "Store not found" }), { status: 404, headers: corsHeaders });

  // 3. Upsert Customer (v3 model)
  const { data: customer } = await supabase.from("customers_v3").upsert({
    user_id: store.user_id,
    store_id: storeId,
    phone: normalized.customer_phone,
    email: normalized.customer_email,
    name: normalized.customer_name,
  }, { onConflict: "store_id, phone" }).select("id").single();

  // 4. Save Abandoned Cart
  const { error: cartError } = await supabase.from("abandoned_carts").upsert({
    user_id: store.user_id,
    store_id: storeId,
    customer_id: customer?.id,
    external_id: normalized.external_id,
    source,
    cart_value: normalized.cart_value,
    cart_items: normalized.cart_items,
    recovery_url: normalized.recovery_url,
    status: "pending",
    raw_payload: payload,
    // New enriched fields
    utm_source: normalized.utm_source,
    utm_medium: normalized.utm_medium,
    utm_campaign: normalized.utm_campaign,
    shipping_value: normalized.shipping_value,
    shipping_zip_code: normalized.shipping_zip_code,
    payment_failure_reason: normalized.payment_failure_reason,
    inventory_status: normalized.inventory_status,
    abandon_step: normalized.abandon_step ?? null,
  }, { onConflict: "store_id, external_id" });

  if (cartError) {
    console.error(`[${requestId}] Cart error:`, cartError);
    return errorResponse("Internal server error", 500);
  }

  // 5. Trigger Flow Engine (async) — payment_pending na etapa/falha de pagamento; senão carrinho clássico
  if (customer?.id) {
    const paymentLike =
      normalized.abandon_step === "payment" ||
      (typeof normalized.payment_failure_reason === "string" &&
        normalized.payment_failure_reason.trim().length > 0);
    const event = paymentLike ? "payment_pending" : "cart_abandoned";
    invokeFlowEngine(url.origin, {
      event,
      store_id: storeId,
      customer_id: customer.id,
      payload: {
        recovery_url: normalized.recovery_url ?? "",
        cart_value: normalized.cart_value,
        shipping_value: normalized.shipping_value,
      },
    }).catch((e) => console.error(`[${requestId}] flow-engine`, e));
  }

  console.log(
    `[${requestId}] webhook-cart ok source=${source} store=${storeId} elapsed_ms=${Date.now() - startedAt}`,
  );
  await writeAuditLog(supabase, {
    action: "webhook_ingest",
    resource: "webhook-cart",
    result: "success",
    ip,
    tenant_id: storeId,
    metadata: { request_id: requestId, source },
  });
  return new Response(JSON.stringify({ ok: true, store_id: storeId, request_id: requestId }), { status: 200, headers: corsHeaders });
});

function detectSource(req: Request, payload: any): string {
  const ua = req.headers.get("user-agent") ?? "";
  const ual = ua.toLowerCase();
  if (ual.includes("shopify")) return "shopify";
  if (payload.checkout && payload.store_id) return "nuvemshop";
  if (ual.includes("woocommerce") || payload.cart_hash != null) return "woocommerce";
  return "custom";
}

/** Heurística de etapa do checkout abandonado (Shopify / genérico). */
function inferAbandonStepFromCheckout(ch: any, source: string): string | null {
  const explicit = ch?.abandon_step ?? ch?.step ?? ch?.checkout_step;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  if (source === "shopify") {
    if (ch?.last_payment_error_message) return "payment";
    if (ch?.shipping_address?.zip || ch?.shipping_lines?.length) return "shipping_or_delivery";
    if (ch?.email || ch?.customer?.email) return "contact_information";
    return "unknown";
  }
  if (ch?.payment_error_message) return "payment";
  if (ch?.shipping_address || ch?.shipping_zip_code) return "shipping_or_delivery";
  if (ch?.customer_email || ch?.contact?.email) return "contact_information";
  return "unknown";
}

function normalizePayload(source: string, p: any) {
  if (source === "shopify") {
    const ch = p.checkout ?? p;
    const items = (ch.line_items || []).map((item: any) => ({
      id: item.product_id,
      variant_id: item.variant_id,
      name: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price || 0),
      sku: item.sku,
      // Shopify inventory and tags (if available in webhook payload)
      inventory_quantity: item.variant_inventory_management ? item.variant_inventory_policy : null, 
      category: item.product_type || null,
      tags: item.properties || []
    }));

    return {
      external_id: String(ch.id),
      customer_name: `${ch.customer?.first_name || ""} ${ch.customer?.last_name || ""}`.trim(),
      customer_phone: normalizePhone(ch.phone || ch.customer?.phone || ""),
      customer_email: ch.email || ch.customer?.email,
      cart_value: parseFloat(ch.total_price || 0),
      cart_items: items,
      recovery_url: ch.abandoned_checkout_url,
      // Enriched fields
      utm_source: ch.utm_source || null,
      utm_medium: ch.utm_medium || null,
      utm_campaign: ch.utm_campaign || null,
      shipping_value: parseFloat(ch.total_shipping_price_set?.shop_money?.amount || 0),
      shipping_zip_code: ch.shipping_address?.zip || null,
      payment_failure_reason: ch.last_payment_error_message || null,
      // Inventory Status JSON
      inventory_status: items.map((i: any) => ({ sku: i.sku, qty: i.inventory_quantity })),
      abandon_step: inferAbandonStepFromCheckout(ch, "shopify"),
    };
  }

  if (source === "woocommerce") {
    const ch = p.checkout ?? p;
    const items = (ch.line_items || []).map((item: any) => ({
      id: item.product_id,
      name: item.name || item.product_name,
      quantity: item.quantity,
      price: parseFloat(item.price || item.subtotal || 0),
      sku: item.sku,
      inventory_quantity: null,
      category: null,
    }));
    return {
      external_id: String(ch.id || ch.checkout_id || ""),
      customer_name: `${ch.billing?.first_name || ""} ${ch.billing?.last_name || ""}`.trim() || ch.customer_name || "",
      customer_phone: normalizePhone(ch.billing?.phone || ch.phone || ""),
      customer_email: ch.billing?.email || ch.customer_email,
      cart_value: parseFloat(ch.total || ch.cart_total || 0),
      cart_items: items,
      recovery_url: ch.checkout_url || ch.payment_url || null,
      utm_source: ch.utm_source || null,
      utm_medium: ch.utm_medium || null,
      utm_campaign: ch.utm_campaign || null,
      shipping_value: parseFloat(ch.shipping_total || 0),
      shipping_zip_code: ch.shipping?.postcode || null,
      payment_failure_reason: ch.payment_error_message || null,
      inventory_status: items.map((i: any) => ({ sku: i.sku, qty: i.inventory_quantity })),
      abandon_step: inferAbandonStepFromCheckout(ch, "woocommerce"),
    };
  }
  
  // Nuvemshop or Custom
  const ch = p.checkout ?? p;
  const items = (ch.items || ch.products || []).map((item: any) => ({
    id: item.id || item.product_id,
    name: item.name || item.title,
    quantity: item.quantity,
    price: parseFloat(item.price || 0),
    sku: item.sku,
    inventory_quantity: item.stock || null,
    category: item.category || null
  }));

  return {
    external_id: String(ch.id || ""),
    customer_name: ch.customer_name || ch.contact?.name || "",
    customer_phone: normalizePhone(ch.customer_phone || ch.contact?.phone || ""),
    customer_email: ch.customer_email || ch.contact?.email,
    cart_value: parseFloat(ch.cart_value || ch.total || 0),
    cart_items: items,
    recovery_url: ch.recovery_url || ch.checkout_url,
    utm_source: ch.utm_source || null,
    utm_medium: ch.utm_medium || null,
    utm_campaign: ch.utm_campaign || null,
    shipping_value: parseFloat(ch.shipping_cost || 0),
    shipping_zip_code: ch.shipping_zip_code || ch.shipping_address?.zip_code || null,
    payment_failure_reason: ch.payment_error_message || null,
    inventory_status: items.map((i: any) => ({ sku: i.sku, qty: i.inventory_quantity })),
    abandon_step: inferAbandonStepFromCheckout(ch, source === "nuvemshop" ? "nuvemshop" : "custom"),
  };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}
