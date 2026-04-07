/**
 * LTV Boost v4 — Abandoned Cart Webhook
 *
 * Endpoint: POST /functions/v1/webhook-cart?store_id=UUID
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const storeId = url.searchParams.get("store_id");

  if (!storeId) {
    return new Response(JSON.stringify({ error: "store_id is required in query params" }), { status: 400, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

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
    value: normalized.cart_value,
    items: normalized.cart_items,
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
    inventory_status: normalized.inventory_status
  }, { onConflict: "store_id, external_id" });

  if (cartError) {
    console.error("Cart error:", cartError);
    return new Response(JSON.stringify({ error: cartError.message }), { status: 500, headers: corsHeaders });
  }

  // 5. Trigger Flow Engine (Async)
  fetch(`${url.origin}/functions/v1/flow-engine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('Authorization') || '' },
    body: JSON.stringify({ event: 'cart_abandoned', store_id: storeId, customer_id: customer?.id })
  }).catch(console.error);

  return new Response(JSON.stringify({ ok: true, store_id: storeId }), { status: 200, headers: corsHeaders });
});

function detectSource(req: Request, payload: any): string {
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("shopify")) return "shopify";
  if (payload.checkout && payload.store_id) return "nuvemshop";
  return "custom";
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
      inventory_status: items.map((i: any) => ({ sku: i.sku, qty: i.inventory_quantity }))
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
    inventory_status: items.map((i: any) => ({ sku: i.sku, qty: i.inventory_quantity }))
  };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}
