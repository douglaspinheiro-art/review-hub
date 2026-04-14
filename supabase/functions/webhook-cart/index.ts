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
  timingSafeEqual,
  z,
} from "../_shared/edge-utils.ts";
import { writeAuditLog } from "../_shared/audit.ts";
import { uuidSchema, validateRequest } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

/** Shared Payload Structure */
interface CartWebhookPayload {
  checkout?: Record<string, unknown>;
  store_id?: string;
  cart_hash?: string;
  [key: string]: unknown;
}

/** Normalized Item Structure */
interface NormalizedItem {
  id?: string | number;
  variant_id?: string | number;
  name?: string;
  quantity?: number;
  price: number;
  sku?: string;
  inventory_quantity?: number | null;
  category?: string | null;
  tags?: unknown[];
}

/** Normalized Final Payload */
interface NormalizedCartPayload {
  external_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  cart_value: number;
  cart_items: NormalizedItem[];
  recovery_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  shipping_value?: number;
  shipping_zip_code?: string | null;
  payment_failure_reason?: string | null;
  inventory_status?: Array<{ sku?: string; qty: number | null }>;
  abandon_step: string | null;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 256 * 1024 });
  if (!parsedReq.ok) return parsedReq.response;

  const expectedSecret = Deno.env.get("WEBHOOK_CART_SECRET") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";

  if (!expectedSecret) {
    // Fail-closed: secret not configured → reject all requests.
    return new Response(JSON.stringify({ error: "Webhook secret is not configured" }), { status: 503, headers: corsHeaders });
  }
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized webhook" }), { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const querySchema = z.object({ store_id: uuidSchema });
  const queryParsed = querySchema.safeParse({ store_id: url.searchParams.get("store_id") });
  if (!queryParsed.success) return errorResponse("store_id is required in query params", 400);
  const storeId = queryParsed.data.store_id;

  let payload: CartWebhookPayload;
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
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    return new Response(JSON.stringify({ error: "Store not found" }), { status: 404, headers: corsHeaders });
  }

  // 3. Enqueue for background processing.
  // Use ignoreDuplicates:true (INSERT ... ON CONFLICT DO NOTHING) to be proactively idempotent.
  // A reactive check (catch 23505 after INSERT) has a race window where two simultaneous
  // deliveries of the same webhook can both succeed before the constraint fires.
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
    console.log(`[${requestId}] Webhook for external_id ${normalized.external_id} already exists (idempotency ok).`);
    return new Response(JSON.stringify({ ok: true, message: "Webhook already received" }), { status: 202, headers: corsHeaders });
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
  return new Response(JSON.stringify({ ok: true, store_id: storeId, request_id: requestId, message: "Webhook enqueued for processing" }), { status: 202, headers: corsHeaders });
});

function detectSource(req: Request, payload: CartWebhookPayload): string {
  const ua = req.headers.get("user-agent") ?? "";
  const ual = ua.toLowerCase();
  if (ual.includes("shopify")) return "shopify";
  if (payload.checkout && payload.store_id) return "nuvemshop";
  if (ual.includes("woocommerce") || payload.cart_hash != null) return "woocommerce";
  return "custom";
}

/** Generic Checkout Object for various platforms */
interface CheckoutObj {
  id?: string | number;
  abandon_step?: string;
  step?: string;
  checkout_step?: string;
  last_payment_error_message?: string;
  payment_error_message?: string;
  email?: string;
  customer_email?: string;
  phone?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  shipping_address?: {
    zip?: string;
    zip_code?: string;
  };
  shipping_zip_code?: string;
  shipping_lines?: unknown[];
  line_items?: Record<string, unknown>[]; // will fix this too
  items?: Record<string, unknown>[];
  products?: Record<string, unknown>[];
  total_price?: string | number;
  total?: string | number;
  cart_total?: string | number;
  abandoned_checkout_url?: string;
  checkout_url?: string;
  payment_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  total_shipping_price_set?: {
    shop_money?: {
      amount?: string | number;
    };
  };
  shipping_total?: string | number;
  shipping_cost?: string | number;
  shipping?: {
    postcode?: string;
  };
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  customer_name?: string;
  customer_phone?: string;
  [key: string]: unknown;
}

/** Heurística de etapa do checkout abandonado (Shopify / genérico). */
function inferAbandonStepFromCheckout(ch: CheckoutObj, source: string): string | null {
  const explicit = ch.abandon_step ?? ch.step ?? ch.checkout_step;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  if (source === "shopify") {
    if (ch.last_payment_error_message) return "payment";
    if (ch.shipping_address?.zip || ch.shipping_lines?.length) return "shipping_or_delivery";
    if (ch.email || ch.customer?.email) return "contact_information";
    return "unknown";
  }
  if (ch.payment_error_message) return "payment";
  if (ch.shipping_address || ch.shipping_zip_code) return "shipping_or_delivery";
  if (ch.customer_email || ch.contact?.email) return "contact_information";
  return "unknown";
}

/** External Cart Item from various platforms */
interface ExternalCartItem {
  id?: string | number;
  product_id?: string | number;
  variant_id?: string | number;
  title?: string;
  name?: string;
  product_name?: string;
  quantity?: number;
  price?: string | number;
  subtotal?: string | number;
  sku?: string;
  variant_inventory_management?: unknown;
  variant_inventory_policy?: number;
  product_type?: string;
  properties?: unknown[];
  stock?: number;
  category?: string;
  [key: string]: unknown;
}

function normalizePayload(source: string, p: CartWebhookPayload): NormalizedCartPayload {
  if (source === "shopify") {
    const ch = (p.checkout ?? p) as CheckoutObj;
    const items: NormalizedItem[] = ((ch.line_items || []) as ExternalCartItem[]).map((item) => ({
      id: String(item.product_id ?? ""),
      variant_id: String(item.variant_id ?? ""),
      name: String(item.title ?? ""),
      quantity: Number(item.quantity ?? 0),
      price: parseFloat(String(item.price || 0)),
      sku: String(item.sku ?? ""),
      inventory_quantity: item.variant_inventory_management ? Number(item.variant_inventory_policy ?? 0) : null, 
      category: String(item.product_type || ""),
      tags: (item.properties || []) as unknown[]
    }));

    return {
      external_id: String(ch.id ?? ""),
      customer_name: `${ch.customer?.first_name || ""} ${ch.customer?.last_name || ""}`.trim(),
      customer_phone: normalizePhone(ch.phone || ch.customer?.phone || ""),
      customer_email: ch.email || ch.customer?.email,
      cart_value: parseFloat(String(ch.total_price || 0)),
      cart_items: items,
      recovery_url: ch.abandoned_checkout_url,
      utm_source: ch.utm_source || null,
      utm_medium: ch.utm_medium || null,
      utm_campaign: ch.utm_campaign || null,
      shipping_value: parseFloat(String(ch.total_shipping_price_set?.shop_money?.amount || 0)),
      shipping_zip_code: ch.shipping_address?.zip || null,
      payment_failure_reason: ch.last_payment_error_message || null,
      inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
      abandon_step: inferAbandonStepFromCheckout(ch, "shopify"),
    };
  }

  if (source === "woocommerce") {
    const ch = (p.checkout ?? p) as CheckoutObj;
    const items: NormalizedItem[] = ((ch.line_items || []) as ExternalCartItem[]).map((item) => ({
      id: String(item.product_id ?? ""),
      name: String(item.name || item.product_name || ""),
      quantity: Number(item.quantity ?? 0),
      price: parseFloat(String(item.price || item.subtotal || 0)),
      sku: String(item.sku ?? ""),
      inventory_quantity: null,
      category: null,
    }));
    return {
      external_id: String(ch.id || ch.checkout_id || ""),
      customer_name: `${ch.billing?.first_name || ""} ${ch.billing?.last_name || ""}`.trim() || ch.customer_name || "",
      customer_phone: normalizePhone(ch.billing?.phone || ch.phone || ""),
      customer_email: ch.billing?.email || ch.customer_email,
      cart_value: parseFloat(String(ch.total || ch.cart_total || 0)),
      cart_items: items,
      recovery_url: ch.checkout_url || ch.payment_url || null,
      utm_source: ch.utm_source || null,
      utm_medium: ch.utm_medium || null,
      utm_campaign: ch.utm_campaign || null,
      shipping_value: parseFloat(String(ch.shipping_total || 0)),
      shipping_zip_code: ch.shipping?.postcode || null,
      payment_failure_reason: ch.payment_error_message || null,
      inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
      abandon_step: inferAbandonStepFromCheckout(ch, "woocommerce"),
    };
  }
  
  // Nuvemshop or Custom
  const ch = (p.checkout ?? p) as CheckoutObj;
  const items: NormalizedItem[] = (((ch.items || ch.products || []) as ExternalCartItem[])).map((item) => ({
    id: String(item.id || item.product_id || ""),
    name: String(item.name || item.title || ""),
    quantity: Number(item.quantity ?? 0),
    price: parseFloat(String(item.price || 0)),
    sku: String(item.sku ?? ""),
    inventory_quantity: Number(item.stock ?? 0) || null,
    category: String(item.category || "")
  }));

  return {
    external_id: String(ch.id || ""),
    customer_name: ch.customer_name || ch.contact?.name || "",
    customer_phone: normalizePhone(ch.customer_phone || ch.contact?.phone || ""),
    customer_email: ch.customer_email || ch.contact?.email,
    cart_value: parseFloat(String(ch.cart_value || ch.total || 0)),
    cart_items: items,
    recovery_url: ch.recovery_url || ch.checkout_url,
    utm_source: ch.utm_source || null,
    utm_medium: ch.utm_medium || null,
    utm_campaign: ch.utm_campaign || null,
    shipping_value: parseFloat(String(ch.shipping_cost || 0)),
    shipping_zip_code: ch.shipping_zip_code || ch.shipping_address?.zip_code || null,
    payment_failure_reason: ch.payment_error_message || null,
    inventory_status: items.map((i) => ({ sku: i.sku, qty: i.inventory_quantity ?? null })),
    abandon_step: inferAbandonStepFromCheckout(ch, source === "nuvemshop" ? "nuvemshop" : "custom"),
  };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}
