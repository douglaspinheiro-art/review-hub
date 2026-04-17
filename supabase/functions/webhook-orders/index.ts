/**
 * LTV Boost v4 — Order Webhook
 *
 * Ingests order events from e-commerce platforms into orders_v3.
 * Triggers post_purchase and review_request journeys automatically.
 *
 * Endpoint: POST /functions/v1/webhook-orders?store_id=UUID
 * Auth: x-webhook-secret = WEBHOOK_ORDERS_SECRET
 *
 * Supported platforms: shopify | woocommerce | vtex | nuvemshop | tray | yampi | custom
 *
 * Platform triggers to register:
 *   Shopify    — Webhook topic: orders/paid, orders/fulfilled, orders/updated
 *   WooCommerce — Webhook topic: order.updated (filter by status=completed/processing)
 *   VTEX       — Order status change hook (filter by status=invoiced/delivered)
 *   Nuvemshop  — Event: store/order/paid, store/order/fulfilled
 *   Tray       — Order status change webhook
 *   Yampi      — Order webhook on status change
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
  normalizePhone,
  verifyMagentoToken,
  verifyNuvemshopToken,
  verifyShopifyHmac,
  verifyWooCommerceHmac,
  verifyVtexAppKey,
  verifyTrayHmac,
  verifyYampiHmac,
} from "../_shared/normalize-webhook.ts";
import { invokeFlowEngine } from "../_shared/flow-engine-invoke.ts";
import { isOrderPaid, type SignaturePlatform } from "../_shared/order-payment-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface NormalizedOrder {
  external_id: string;
  customer_phone: string;
  customer_email?: string;
  customer_name: string;
  valor: number;
  valor_desconto: number;
  valor_frete: number;
  status: string;           // platform-native status string
  financial_status: string; // paid | pending | refunded | voided
  fulfillment_status: string; // fulfilled | unfulfilled | partial | null
  payment_method?: string;
  produtos_json: Array<{ sku?: string; nome: string; qtd: number; price?: number }>;
  created_at?: string;
  /** True when the order is confirmed paid — triggers post_purchase journey */
  is_paid: boolean;
  /** True when the order is delivered — triggers review_request journey */
  is_delivered: boolean;
}

// ── Normalization ──────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

function toFloat(v: unknown): number {
  return parseFloat(String(v ?? 0)) || 0;
}
function toInt(v: unknown): number {
  return parseInt(String(v ?? 0), 10) || 0;
}
function toStr(v: unknown): string {
  return v != null ? String(v) : "";
}

function normalizeShopifyOrder(p: AnyRecord): NormalizedOrder {
  const customer = (p.customer ?? {}) as AnyRecord;
  const financialStatus = toStr(p.financial_status || p.financialStatus).toLowerCase();
  const fulfillmentStatus = toStr(p.fulfillment_status || p.fulfillmentStatus || "unfulfilled").toLowerCase();

  const lineItems: AnyRecord[] = (p.line_items || []) as AnyRecord[];
  const produtos = lineItems.map((item) => ({
    sku: toStr(item.sku || item.variant_id),
    nome: toStr(item.title || item.name),
    qtd: toInt(item.quantity),
    price: toFloat(item.price),
  }));

  // Shopify prices are strings in decimal
  const shipping = (() => {
    const set = (p.total_shipping_price_set as AnyRecord | undefined)?.shop_money as AnyRecord | undefined;
    if (set?.amount) return toFloat(set.amount);
    const lines = (p.shipping_lines || []) as AnyRecord[];
    return lines.reduce((sum, l) => sum + toFloat(l.price), 0);
  })();

  return {
    external_id: toStr(p.id || p.order_id),
    customer_phone: normalizePhone(
      toStr((p as { phone?: unknown }).phone || customer.phone || customer.default_address?.phone || ""),
    ),
    customer_email: toStr(p.email || customer.email) || undefined,
    customer_name: `${toStr(customer.first_name)} ${toStr(customer.last_name)}`.trim() || toStr(customer.name),
    valor: toFloat(p.total_price || p.total_line_items_price),
    valor_desconto: toFloat(p.total_discounts),
    valor_frete: shipping,
    status: toStr(p.financial_status || p.status),
    financial_status: financialStatus,
    fulfillment_status: fulfillmentStatus,
    payment_method: toStr((p.payment_details as AnyRecord | undefined)?.payment_method_name || p.gateway) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.created_at) || undefined,
    is_paid: ["paid", "partially_paid"].includes(financialStatus),
    is_delivered: fulfillmentStatus === "fulfilled",
  };
}

function normalizeWooCommerceOrder(p: AnyRecord): NormalizedOrder {
  const billing = (p.billing ?? {}) as AnyRecord;
  const status = toStr(p.status).toLowerCase();
  const lineItems: AnyRecord[] = (p.line_items || []) as AnyRecord[];
  const produtos = lineItems.map((item) => ({
    sku: toStr(item.sku),
    nome: toStr(item.name),
    qtd: toInt(item.quantity),
    price: toFloat(item.price),
  }));

  const shipping = (p.shipping_lines as AnyRecord[] | undefined)?.reduce(
    (s, l) => s + toFloat(l.total),
    0,
  ) ?? toFloat(p.shipping_total);

  return {
    external_id: toStr(p.id || p.order_id),
    customer_phone: normalizePhone(toStr(billing.phone || (p as { phone?: unknown }).phone || "")),
    customer_email: toStr(billing.email) || undefined,
    customer_name: `${toStr(billing.first_name)} ${toStr(billing.last_name)}`.trim(),
    valor: toFloat(p.total),
    valor_desconto: toFloat(p.discount_total),
    valor_frete: shipping,
    status,
    financial_status: ["completed", "processing"].includes(status) ? "paid" : status,
    fulfillment_status: status === "completed" ? "fulfilled" : "unfulfilled",
    payment_method: toStr(p.payment_method_title || p.payment_method) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.date_created) || undefined,
    is_paid: ["completed", "processing"].includes(status),
    is_delivered: status === "completed",
  };
}

function normalizeVTEXOrder(p: AnyRecord): NormalizedOrder {
  // VTEX order status hook: { orderId, status, clientProfileData, totals, items, ... }
  const profile = (p.clientProfileData ?? p.customer ?? {}) as AnyRecord;
  const status = toStr(p.status || p.State || "").toLowerCase();
  const totals = (p.totals || []) as AnyRecord[];
  const itemsTotal = totals.find((t) => String(t.id).toLowerCase() === "items");
  const discountsTotal = totals.find((t) => String(t.id).toLowerCase() === "discounts");
  const shippingTotal = totals.find((t) => String(t.id).toLowerCase() === "shipping");
  // VTEX values are in cents
  const toVtx = (v: unknown) => toFloat(v) / 100;

  const items: AnyRecord[] = (p.items || p.Products || []) as AnyRecord[];
  const produtos = items.map((item) => ({
    sku: toStr(item.refId || item.SellerSku || item.id),
    nome: toStr(item.name || item.Name),
    qtd: toInt(item.quantity || item.Quantity),
    price: toVtx(item.price || item.Price),
  }));

  const paidStatuses = ["invoiced", "payment-approved", "ready-for-handling", "handling", "waiting-for-fulfillment", "shipped", "delivered"];

  return {
    external_id: toStr(p.orderId || p.OrderId || p.id),
    customer_phone: normalizePhone(
      toStr(profile.phone || profile.homePhone || profile.businessPhone || (p as { phone?: unknown }).phone || ""),
    ),
    customer_email: toStr(profile.email || (p as { email?: unknown }).email) || undefined,
    customer_name: `${toStr(profile.firstName)} ${toStr(profile.lastName)}`.trim() || toStr(profile.name),
    valor: itemsTotal ? toVtx(itemsTotal.value) : toVtx(p.value || p.total),
    valor_desconto: discountsTotal ? Math.abs(toVtx(discountsTotal.value)) : 0,
    valor_frete: shippingTotal ? toVtx(shippingTotal.value) : 0,
    status,
    financial_status: paidStatuses.includes(status) ? "paid" : "pending",
    fulfillment_status: status === "delivered" ? "fulfilled" : "unfulfilled",
    payment_method: toStr((p.paymentData as AnyRecord | undefined)?.transactions?.[0]?.payments?.[0]?.paymentSystemName) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.creationDate || p.created_at) || undefined,
    is_paid: paidStatuses.includes(status),
    is_delivered: status === "delivered",
  };
}

function normalizeNuvemshopOrder(p: AnyRecord): NormalizedOrder {
  const customer = (p.customer ?? {}) as AnyRecord;
  const status = toStr(p.payment_status || p.status || "").toLowerCase();
  const products: AnyRecord[] = (p.products || p.items || []) as AnyRecord[];
  const produtos = products.map((item) => ({
    sku: toStr(item.sku || item.product_id),
    nome: toStr(item.name || item.product_name),
    qtd: toInt(item.quantity),
    price: toFloat(item.price),
  }));

  return {
    external_id: toStr(p.id || p.order_id),
    customer_phone: normalizePhone(
      toStr(customer.phone || customer.mobile || (p as { phone?: unknown }).phone || ""),
    ),
    customer_email: toStr(customer.email || (p as { email?: unknown }).email) || undefined,
    customer_name: toStr(customer.name || `${toStr(customer.first_name)} ${toStr(customer.last_name)}`.trim()),
    valor: toFloat(p.total || p.subtotal),
    valor_desconto: toFloat(p.discount || p.total_discount),
    valor_frete: toFloat(p.shipping_cost_owner || p.shipping_cost || p.shipping),
    status,
    financial_status: ["paid", "approved", "captured"].includes(status) ? "paid" : "pending",
    fulfillment_status: ["shipped", "delivered"].includes(toStr(p.shipping_status).toLowerCase()) ? "fulfilled" : "unfulfilled",
    payment_method: toStr(p.payment_method) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.created_at) || undefined,
    is_paid: ["paid", "approved", "captured"].includes(status),
    is_delivered: toStr(p.shipping_status).toLowerCase() === "delivered",
  };
}

function normalizeMagento2Order(p: AnyRecord): NormalizedOrder {
  // Magento 2 order webhook (REST API observer or Magento_Webhook module).
  // Key fields: increment_id, customer_email/firstname/lastname, billing_address.telephone,
  // status/state, grand_total, discount_amount, shipping_amount, items[].{sku, name, qty_ordered, price}
  const billing = (p.billing_address ?? {}) as AnyRecord;
  const status = toStr(p.status || p.state || "").toLowerCase();
  const items: AnyRecord[] = (p.items || p.extension_attributes?.applied_taxes || []) as AnyRecord[];
  const normalItems = items.filter(
    (i) => toStr(i.product_type).toLowerCase() !== "bundle" && toFloat(i.price) > 0,
  );
  const produtos = normalItems.map((item) => ({
    sku: toStr(item.sku),
    nome: toStr(item.name),
    qtd: toInt(item.qty_ordered || item.qty || item.quantity),
    price: toFloat(item.price || item.base_price),
  }));

  const paidStatuses = ["processing", "complete", "shipped"];

  return {
    external_id: toStr(p.increment_id || p.entity_id),
    customer_phone: normalizePhone(toStr(billing.telephone || (p as { phone?: unknown }).phone || "")),
    customer_email: toStr(p.customer_email || billing.email) || undefined,
    customer_name: `${toStr(p.customer_firstname)} ${toStr(p.customer_lastname)}`.trim() ||
      toStr(billing.firstname ? `${billing.firstname} ${billing.lastname}` : ""),
    valor: toFloat(p.grand_total || p.base_grand_total),
    valor_desconto: toFloat(p.discount_amount || p.base_discount_amount),
    valor_frete: toFloat(p.shipping_amount || p.shipping_incl_tax),
    status,
    financial_status: paidStatuses.includes(status) ? "paid" : "pending",
    fulfillment_status: status === "complete" ? "fulfilled" : "unfulfilled",
    payment_method: toStr((p.payment as AnyRecord | undefined)?.method) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.created_at) || undefined,
    is_paid: paidStatuses.includes(status),
    is_delivered: status === "complete",
  };
}

function normalizeTrayOrder(p: AnyRecord): NormalizedOrder {
  // Tray Commerce: { Order: { id, total, status, Customer: { ... }, OrderProduct: [...] } }
  const order = (p.Order ?? p) as AnyRecord;
  const customer = (order.Customer ?? order.customer ?? {}) as AnyRecord;
  const status = toStr(order.status || order.point_sale || "").toLowerCase();
  const products: AnyRecord[] = (order.OrderProduct ?? order.products ?? order.items ?? []) as AnyRecord[];
  const produtos = products.map((item) => {
    const prod = (item.OrderProduct ?? item) as AnyRecord;
    return {
      sku: toStr(prod.reference || prod.sku || prod.id),
      nome: toStr(prod.product_name || prod.name),
      qtd: toInt(prod.quantity || prod.qty),
      price: toFloat(prod.price || prod.unit_price),
    };
  });

  const paidStatuses = ["aprovado", "approved", "pago", "paid", "completo", "complete"];

  return {
    external_id: toStr(order.id || p.id),
    customer_phone: normalizePhone(toStr(customer.cellphone || customer.phone || customer.telephone || "")),
    customer_email: toStr(customer.email || order.email) || undefined,
    customer_name: toStr(customer.name || `${toStr(customer.firstname)} ${toStr(customer.lastname)}`.trim()),
    valor: toFloat(order.total || order.partial_total),
    valor_desconto: toFloat(order.discount || order.total_discount),
    valor_frete: toFloat(order.shipment_value || order.shipping || order.shipping_cost),
    status,
    financial_status: paidStatuses.includes(status) ? "paid" : "pending",
    fulfillment_status: ["enviado", "shipped", "entregue", "delivered"].includes(status) ? "fulfilled" : "unfulfilled",
    payment_method: toStr(order.payment_method || order.payment_form) || undefined,
    produtos_json: produtos,
    created_at: toStr(order.date || order.created_at || p.created_at) || undefined,
    is_paid: paidStatuses.includes(status),
    is_delivered: ["entregue", "delivered"].includes(status),
  };
}

function normalizeYampiOrder(p: AnyRecord): NormalizedOrder {
  // Yampi: { id, number, status: { alias }, customer: { name, email, cellphone }, items, totals, ... }
  const customer = (p.customer ?? {}) as AnyRecord;
  const statusObj = (p.status ?? {}) as AnyRecord;
  const status = toStr(statusObj.alias || p.status_alias || p.status || "").toLowerCase();
  const items: AnyRecord[] = (p.items ?? p.products ?? []) as AnyRecord[];
  const produtos = items.map((item) => ({
    sku: toStr(item.sku || item.product_id),
    nome: toStr(item.name || item.product_name),
    qtd: toInt(item.quantity || item.qty),
    price: toFloat(item.price || item.unit_price),
  }));

  const totals = (p.totals ?? {}) as AnyRecord;
  const paidStatuses = ["paid", "approved", "invoiced", "pago"];

  return {
    external_id: toStr(p.number || p.id),
    customer_phone: normalizePhone(toStr(customer.cellphone || customer.phone || customer.mobile || "")),
    customer_email: toStr(customer.email || p.email) || undefined,
    customer_name: toStr(customer.name || `${toStr(customer.first_name)} ${toStr(customer.last_name)}`.trim()),
    valor: toFloat(totals.total || p.total || p.amount),
    valor_desconto: toFloat(totals.discount || p.discount),
    valor_frete: toFloat(totals.shipping || p.shipping || p.freight),
    status,
    financial_status: paidStatuses.includes(status) ? "paid" : "pending",
    fulfillment_status: ["shipped", "delivered", "enviado", "entregue"].includes(status) ? "fulfilled" : "unfulfilled",
    payment_method: toStr(p.payment_method || (p.payment as AnyRecord | undefined)?.method) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.created_at) || undefined,
    is_paid: paidStatuses.includes(status),
    is_delivered: ["delivered", "entregue"].includes(status),
  };
}

function normalizeCustomOrder(p: AnyRecord): NormalizedOrder {
  const customer = (p.customer ?? {}) as AnyRecord;
  const status = toStr(p.status || p.financial_status || "").toLowerCase();
  const items: AnyRecord[] = (p.items || p.products || p.line_items || []) as AnyRecord[];
  const produtos = items.map((item) => ({
    sku: toStr(item.sku || item.id),
    nome: toStr(item.name || item.title),
    qtd: toInt(item.quantity || item.qty),
    price: toFloat(item.price || item.unit_price),
  }));

  return {
    external_id: toStr(p.id || p.order_id || p.external_id),
    customer_phone: normalizePhone(
      toStr(p.phone || customer.phone || customer.cellphone || ""),
    ),
    customer_email: toStr(p.email || customer.email) || undefined,
    customer_name: toStr(p.customer_name || customer.name),
    valor: toFloat(p.total || p.valor || p.amount),
    valor_desconto: toFloat(p.discount || p.valor_desconto),
    valor_frete: toFloat(p.shipping || p.valor_frete || p.shipping_cost),
    status,
    financial_status: ["paid", "approved"].includes(status) ? "paid" : "pending",
    fulfillment_status: ["fulfilled", "delivered", "shipped"].includes(status) ? "fulfilled" : "unfulfilled",
    payment_method: toStr(p.payment_method) || undefined,
    produtos_json: produtos,
    created_at: toStr(p.created_at) || undefined,
    is_paid: ["paid", "approved", "completed"].includes(status),
    is_delivered: ["delivered", "fulfilled"].includes(status),
  };
}

function normalizeShopeeOrder(p: AnyRecord): NormalizedOrder {
  // Shopee Partner API: order_sn, order_status, buyer_username, item_list, total_amount
  const buyer = (p.buyer ?? p.customer ?? {}) as AnyRecord;
  const status = toStr(p.order_status || p.status || "").toLowerCase();
  const items: AnyRecord[] = (p.item_list || p.items || p.order_items || []) as AnyRecord[];
  const produtos = items.map((item) => ({
    sku: toStr(item.item_sku || item.sku || item.item_id),
    nome: toStr(item.item_name || item.name),
    qtd: toInt(item.model_quantity_purchased || item.quantity),
    price: toFloat(item.model_discounted_price || item.item_price || item.price),
  }));

  const paidStatuses = ["ready_to_ship", "shipped", "completed", "to_confirm_receive"];

  return {
    external_id: toStr(p.order_sn || p.id),
    customer_phone: normalizePhone(toStr(buyer.phone || buyer.cellphone || p.recipient_phone || "")),
    customer_email: toStr(buyer.email) || undefined,
    customer_name: toStr(buyer.buyer_username || buyer.name || p.buyer_username),
    valor: toFloat(p.total_amount || p.escrow_amount),
    valor_desconto: toFloat(p.voucher_absorbed || p.seller_discount || 0),
    valor_frete: toFloat(p.actual_shipping_fee || p.estimated_shipping_fee || 0),
    status,
    financial_status: paidStatuses.includes(status) ? "paid" : "pending",
    fulfillment_status: status === "completed" ? "fulfilled" : "unfulfilled",
    payment_method: toStr(p.payment_method) || undefined,
    produtos_json: produtos,
    created_at: p.create_time ? new Date(Number(p.create_time) * 1000).toISOString() : undefined,
    is_paid: paidStatuses.includes(status),
    is_delivered: status === "completed",
  };
}

function normalizeOrder(source: string, p: unknown): NormalizedOrder {
  const payload = (p ?? {}) as AnyRecord;
  switch (source) {
    case "shopify":     return normalizeShopifyOrder(payload);
    case "woocommerce": return normalizeWooCommerceOrder(payload);
    case "vtex":        return normalizeVTEXOrder(payload);
    case "nuvemshop":   return normalizeNuvemshopOrder(payload);
    case "magento":     return normalizeMagento2Order(payload);
    case "tray":        return normalizeTrayOrder(payload);
    case "yampi":       return normalizeYampiOrder(payload);
    case "shopee":      return normalizeShopeeOrder(payload);
    default:            return normalizeCustomOrder(payload);
  }
}

function detectOrderSource(req: Request, payload: unknown): string {
  const p = (payload ?? {}) as AnyRecord;
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (ua.includes("shopify") || req.headers.get("x-shopify-topic")) return "shopify";
  if (ua.includes("woocommerce") || req.headers.get("x-wc-webhook-topic")) return "woocommerce";
  if (req.headers.get("x-linkedstore-token") || req.headers.get("x-notification-token")) return "nuvemshop";
  if ((p as { OrderFormId?: unknown })?.OrderFormId != null ||
      (p as { orderId?: unknown })?.orderId != null) return "vtex";
  if ((p as { customer_firstname?: unknown })?.customer_firstname != null ||
      (p as { increment_id?: unknown })?.increment_id != null) return "magento";
  // Shopee: order_sn + shop_id
  if ((p as { order_sn?: unknown })?.order_sn != null &&
      (p as { shop_id?: unknown })?.shop_id != null) return "shopee";
  if (ua.includes("shopee")) return "shopee";
  const qs = new URL(req.url).searchParams.get("platform") ?? "";
  if (qs) return qs.toLowerCase();
  return "custom";
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const expectedSecret = Deno.env.get("WEBHOOK_ORDERS_SECRET") ?? "";
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "WEBHOOK_ORDERS_SECRET is not configured" }), {
      status: 503, headers: corsHeaders,
    });
  }
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  // ── Query params ────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const querySchema = z.object({ store_id: uuidSchema });
  const queryParsed = querySchema.safeParse({ store_id: url.searchParams.get("store_id") });
  if (!queryParsed.success) return errorResponse("store_id is required in query params", 400);
  const storeId = queryParsed.data.store_id;

  // ── Read body (raw needed for HMAC verification) ───────────────────────────
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 512 * 1024) {
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

  // ── Supabase + rate limit ───────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ── Platform-specific HMAC/token verification (fail-closed) ───────────────
  const source = detectOrderSource(req, payload);
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
    if (secretResult.ok) {
      signatureOk = verifyVtexAppKey(req, secretResult.secret);
    }
  } else if (source === "tray") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "tray");
    if (secretResult.ok) {
      signatureOk = await verifyTrayHmac(req, rawBody, secretResult.secret);
    }
  } else if (source === "yampi") {
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "yampi");
    if (secretResult.ok) {
      signatureOk = await verifyYampiHmac(req, rawBody, secretResult.secret);
    }
  } else if (source === "magento") {
    // Magento 2 (and Dizy white-label) — fail-closed per-store token check.
    const secretResult = await getVerifierSecretForStore(supabase, storeId, "magento");
    if (!secretResult.ok) {
      return new Response(JSON.stringify({ error: secretResult.error }), { status: 401, headers: corsHeaders });
    }
    signatureOk = verifyMagentoToken(req, secretResult.secret);
  }

  if (!signatureOk) {
    return new Response(JSON.stringify({ error: "Webhook signature verification failed" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const ip = getClientIp(req);
  const limit = await checkDistributedRateLimit(supabase, `webhook-orders:${storeId}:${ip}`, 120, 60_000);
  if (!limit.allowed) {
    await writeAuditLog(supabase, {
      action: "rate_limit_block",
      resource: "webhook-orders",
      result: "failure",
      ip,
      tenant_id: storeId,
      metadata: { request_id: requestId },
    });
    return rateLimitedResponseWithRetry(limit.retryAfterSeconds);
  }

  // ── Detect platform + normalize ─────────────────────────────────────────────
  const order = normalizeOrder(source, payload);

  if (!order.external_id) {
    return new Response(JSON.stringify({ error: "external_id not found in payload" }), {
      status: 422, headers: corsHeaders,
    });
  }

  if (!order.customer_phone && !order.customer_email) {
    return new Response(JSON.stringify({ error: "customer_phone or customer_email required" }), {
      status: 422, headers: corsHeaders,
    });
  }

  // ── Resolve store owner ─────────────────────────────────────────────────────
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();

  if (storeErr || !store) {
    return new Response(JSON.stringify({ error: "Store not found" }), { status: 404, headers: corsHeaders });
  }

  // ── Atomic upsert: customer + order ────────────────────────────────────────
  const { data: upserted, error: upsertErr } = await supabase.rpc("upsert_order_with_customer", {
    p_user_id:            store.user_id,
    p_store_id:           storeId,
    p_phone:              order.customer_phone || null,
    p_email:              order.customer_email || null,
    p_name:               order.customer_name || null,
    p_pedido_externo_id:  String(order.external_id),
    p_source:             source,
    p_valor:              order.valor,
    p_valor_desconto:     order.valor_desconto,
    p_valor_frete:        order.valor_frete,
    p_status:             order.status,
    p_financial_status:   order.financial_status,
    p_fulfillment_status: order.fulfillment_status,
    p_payment_method:     order.payment_method || null,
    p_produtos_json:      order.produtos_json?.length ? order.produtos_json : null,
    p_created_at:         order.created_at || null,
  });

  if (upsertErr) {
    console.error(`[${requestId}] upsert_order_with_customer error:`, upsertErr.message);
    return errorResponse("Failed to process order", 500);
  }

  const result = upserted as { customer_id: string; order_id: string; is_new_order: boolean };

  // ── Trigger journeys ────────────────────────────────────────────────────────
  // post_purchase: fires on first confirmation that order is paid
  // review_request: fires when order is delivered
  const APP_URL = Deno.env.get("APP_URL") || "https://app.ltvboost.com.br";
  const journeyTriggers: string[] = [];

  if (result.is_new_order && order.is_paid) {
    journeyTriggers.push("post_purchase");
  }
  if (order.is_delivered) {
    journeyTriggers.push("review_request");
  }

  const journeyResults: Record<string, string> = {};
  for (const event of journeyTriggers) {
    try {
      const flowRes = await invokeFlowEngine(APP_URL, {
        event,
        store_id: storeId,
        customer_id: result.customer_id,
        payload: {
          order_id: result.order_id,
          order_value: order.valor,
          payment_method: order.payment_method,
        },
      });
      journeyResults[event] = flowRes.ok ? "triggered" : `failed:${flowRes.status}`;
    } catch (e) {
      journeyResults[event] = `error:${(e as Error).message.slice(0, 100)}`;
    }
  }

  console.log(
    `[${requestId}] webhook-orders processed source=${source} store=${storeId} order=${order.external_id} is_new=${result.is_new_order} journeys=${JSON.stringify(journeyResults)} elapsed_ms=${Date.now() - startedAt}`,
  );

  await writeAuditLog(supabase, {
    action: "order_upserted",
    resource: "webhook-orders",
    result: "success",
    ip,
    tenant_id: storeId,
    metadata: {
      request_id: requestId,
      source,
      external_id: String(order.external_id),
      is_new_order: result.is_new_order,
      journeys: journeyResults,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      request_id: requestId,
      order_id: result.order_id,
      customer_id: result.customer_id,
      is_new_order: result.is_new_order,
      journeys: journeyResults,
    }),
    { status: 202, headers: corsHeaders },
  );
});
