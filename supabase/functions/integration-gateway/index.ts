import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  checkDistributedRateLimit,
  errorResponse,
  getClientIp,
  rateLimitedResponseWithRetry,
} from "../_shared/edge-utils.ts";
import { writeAuditLog } from "../_shared/audit.ts";
import { validateRequest } from "../_shared/validation.ts";
import { invokeFlowEngine } from "../_shared/flow-engine-invoke.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

// --- Zod Schemas ---
const QueryParamsSchema = z.object({
  platform: z.enum(["shopify", "nuvemshop", "vtex", "woocommerce", "tray", "yampi", "shopee", "custom"]),
  loja_id: z.string().uuid("loja_id deve ser UUID válido"),
});

const ShopifyOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  total_price: z.string().optional().default("0"),
  total_discounts: z.string().optional(),
  total_shipping_price_set: z.object({
    shop_money: z.object({ amount: z.string().optional() }).optional(),
  }).optional(),
  payment_gateway_names: z.array(z.string()).optional(),
  customer: z.object({ email: z.string().email().optional(), phone: z.string().optional() }).optional(),
  financial_status: z.string().optional(),
  line_items: z.array(z.object({
    sku: z.string().optional(),
    title: z.string().optional(),
    quantity: z.number().optional(),
  })).optional().default([]),
  discount_codes: z.array(z.object({ code: z.string() })).optional(),
  landing_site: z.string().optional(),
}).passthrough();

const NuvemshopOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  total: z.string().optional().default("0"),
  contact_email: z.string().optional(),
  contact_phone: z.string().optional(),
  status: z.string().optional(),
  products: z.array(z.object({
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().optional(),
  })).optional().default([]),
  coupon: z.array(z.object({ code: z.string() })).optional(),
  extra_params: z.object({ utm_source: z.string().optional() }).optional(),
}).passthrough();

const ShopeeOrderSchema = z.object({
  order_sn: z.string().optional(),
  total_amount: z.number().optional().default(0),
  buyer_username: z.string().optional(),
  item_list: z.array(z.object({
    item_sku: z.string().optional(),
    item_id: z.string().optional(),
    item_name: z.string().optional(),
    model_quantity_purchased: z.number().optional(),
  })).optional().default([]),
}).passthrough();

const VtexOrderSchema = z.object({
  orderId: z.string().optional(),
  value: z.number().optional().default(0),
  clientProfileData: z.object({ email: z.string().optional() }).optional(),
  status: z.string().optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().optional(),
  })).optional().default([]),
  marketingData: z.object({ coupon: z.string().optional() }).optional(),
}).passthrough();

const WooCommerceOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  total: z.string().optional().default("0"),
  discount_total: z.string().optional(),
  shipping_lines: z.array(z.object({ total: z.string().optional() })).optional(),
  payment_method: z.string().optional(),
  billing: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }).optional(),
  status: z.string().optional(),
  line_items: z.array(z.object({
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().optional(),
  })).optional().default([]),
  coupon_lines: z.array(z.object({ code: z.string() })).optional(),
  meta_data: z.array(z.object({ key: z.string(), value: z.any() })).optional(),
}).passthrough();

const TrayOrderSchema = z.object({
  Order: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    total: z.string().optional().default("0"),
    email: z.string().optional(),
    cellphone: z.string().optional(),
    status: z.string().optional(),
    products: z.array(z.object({
      reference: z.string().optional(),
      name: z.string().optional(),
      quantity: z.union([z.string(), z.number()]).optional(),
    })).optional().default([]),
    coupon: z.string().optional(),
  }).passthrough(),
}).passthrough();

const YampiOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  value_total: z.number().optional().default(0),
  customer: z.object({
    email: z.string().optional(),
    phone: z.object({ full_number: z.string().optional() }).optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }).optional(),
  status: z.object({ name: z.string().optional() }).optional(),
  items: z.array(z.object({
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().optional(),
  })).optional().default([]),
  cupom: z.object({ code: z.string().optional() }).optional(),
}).passthrough();

// --- Normalizers ---
interface NormalizedOrder {
  external_id: string | undefined;
  valor: number;
  email: string | undefined;
  telefone: string | undefined;
  status: string | undefined;
  produtos: { sku: string; nome: string; qtd: number }[];
  cupom: string | undefined;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  valor_desconto?: number | null;
  valor_frete?: number | null;
  payment_method?: string | null;
  payment_installments?: number | null;
}

/** BR phone digits with country 55 when possible (alinhado ao webhook-cart). */
function normalizePhoneBr(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

/** Marca carrinhos abertos como recuperados e cancela lembretes pendentes da cadência. */
async function markAbandonedCartsRecoveredAndCancelSchedule(
  supabase: ReturnType<typeof createClient>,
  params: {
    storeId: string;
    userId: string;
    clienteId: string | null;
    phoneNorm: string;
    orderValue: number;
    requestId: string;
  },
) {
  const { storeId, userId, clienteId, phoneNorm, orderValue, requestId } = params;
  const cartIdSet = new Set<string>();

  if (clienteId) {
    const { data: rows, error } = await supabase
      .from("abandoned_carts")
      .select("id")
      .eq("store_id", storeId)
      .eq("customer_id", clienteId)
      .in("status", ["pending", "processing", "message_sent"]);
    if (error) console.warn(`[${requestId}] abandoned_carts by customer:`, error.message);
    for (const r of rows ?? []) cartIdSet.add(r.id);
  }

  if (phoneNorm.length >= 12) {
    const { data: rows, error } = await supabase
      .from("abandoned_carts")
      .select("id")
      .eq("store_id", storeId)
      .eq("customer_phone", phoneNorm)
      .in("status", ["pending", "processing", "message_sent"]);
    if (error) console.warn(`[${requestId}] abandoned_carts by phone:`, error.message);
    for (const r of rows ?? []) cartIdSet.add(r.id);
  }

  const cartIds = [...cartIdSet];
  if (cartIds.length === 0) return;

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("abandoned_carts")
    .update({
      status: "recovered",
      recovered_at: nowIso,
      recovered_value: orderValue,
    })
    .in("id", cartIds);
  if (upErr) console.warn(`[${requestId}] abandoned_carts recover:`, upErr.message);

  for (const cid of cartIds) {
    const { error: cErr } = await supabase
      .from("scheduled_messages")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .eq("store_id", storeId)
      .eq("status", "pending")
      .filter("metadata->>cart_id", "eq", cid);
    if (cErr) console.warn(`[${requestId}] scheduled_messages cancel cart=${cid}:`, cErr.message);
  }
}

/** Status canônico interno para alertas e relatórios. */
function mapInternalStatus(_platform: string, status: string | undefined): string {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (["cancelled", "canceled", "voided", "refunded", "failed"].includes(s)) return "cancelled";
  if (["paid", "completed", "processing", "authorized", "fulfilled", "payment-approved", "invoice"].includes(s)) {
    return "paid_or_processing";
  }
  if (["pending", "pending_payment", "on_hold", "open"].includes(s)) return "pending";
  return "other";
}

function normalizeShopify(raw: z.infer<typeof ShopifyOrderSchema>): NormalizedOrder {
  const freteRaw = raw.total_shipping_price_set?.shop_money?.amount;
  const order: NormalizedOrder = {
    external_id: raw.id?.toString(),
    valor: parseFloat(raw.total_price || "0"),
    email: raw.customer?.email,
    telefone: raw.customer?.phone,
    status: raw.financial_status,
    produtos: (raw.line_items || []).map(i => ({
      sku: i.sku || "N/A",
      nome: i.title || "Produto Shopify",
      qtd: i.quantity || 1,
    })),
    cupom: raw.discount_codes?.[0]?.code,
    valor_desconto: raw.total_discounts ? parseFloat(raw.total_discounts) || null : null,
    valor_frete: freteRaw ? parseFloat(freteRaw) || null : null,
    payment_method: raw.payment_gateway_names?.[0] ?? null,
  };
  if (raw.landing_site) {
    try {
      const ls = new URL(raw.landing_site);
      order.utm_source = ls.searchParams.get("utm_source");
      order.utm_medium = ls.searchParams.get("utm_medium");
      order.utm_campaign = ls.searchParams.get("utm_campaign");
    } catch { /* invalid URL */ }
  }
  return order;
}

function normalizeNuvemshop(raw: z.infer<typeof NuvemshopOrderSchema>): NormalizedOrder {
  return {
    external_id: raw.id?.toString(),
    valor: parseFloat(raw.total || "0"),
    email: raw.contact_email,
    telefone: raw.contact_phone,
    status: raw.status,
    produtos: (raw.products || []).map(i => ({
      sku: i.sku || "N/A",
      nome: i.name || "Produto Nuvemshop",
      qtd: i.quantity || 1,
    })),
    cupom: raw.coupon?.[0]?.code,
    utm_source: raw.extra_params?.utm_source,
  };
}

function normalizeShopee(raw: z.infer<typeof ShopeeOrderSchema>): NormalizedOrder {
  return {
    external_id: raw.order_sn,
    valor: raw.total_amount || 0,
    email: (raw.buyer_username || "shopee_user") + "@shopee.com",
    telefone: undefined,
    status: "completed",
    produtos: (raw.item_list || []).map(i => ({
      sku: i.item_sku || i.item_id || "N/A",
      nome: i.item_name || "Produto Shopee",
      qtd: i.model_quantity_purchased || 1,
    })),
    cupom: undefined,
  };
}

function normalizeVtex(raw: z.infer<typeof VtexOrderSchema>): NormalizedOrder {
  return {
    external_id: raw.orderId,
    valor: (raw.value || 0) / 100,
    email: raw.clientProfileData?.email,
    telefone: undefined,
    status: raw.status,
    produtos: (raw.items || []).map(i => ({
      sku: i.id || "N/A",
      nome: i.name || "Produto VTEX",
      qtd: i.quantity || 1,
    })),
    cupom: raw.marketingData?.coupon,
  };
}

function normalizeWooCommerce(raw: z.infer<typeof WooCommerceOrderSchema>): NormalizedOrder {
  const utmMeta = (raw.meta_data || []);
  const getUtm = (key: string) => utmMeta.find(m => m.key === key)?.value as string | undefined;
  const shipTotal = (raw.shipping_lines || []).reduce((s, l) => s + parseFloat(l.total || "0"), 0);
  return {
    external_id: raw.id?.toString(),
    valor: parseFloat(raw.total || "0"),
    email: raw.billing?.email,
    telefone: raw.billing?.phone,
    status: raw.status,
    produtos: (raw.line_items || []).map(i => ({
      sku: i.sku || "N/A",
      nome: i.name || "Produto WooCommerce",
      qtd: i.quantity || 1,
    })),
    cupom: raw.coupon_lines?.[0]?.code,
    utm_source: getUtm("_wc_order_attribution_utm_source"),
    utm_medium: getUtm("_wc_order_attribution_utm_medium"),
    utm_campaign: getUtm("_wc_order_attribution_utm_campaign"),
    valor_desconto: raw.discount_total ? parseFloat(raw.discount_total) || null : null,
    valor_frete: shipTotal > 0 ? shipTotal : null,
    payment_method: raw.payment_method ?? null,
  };
}

function normalizeTray(raw: z.infer<typeof TrayOrderSchema>): NormalizedOrder {
  const o = raw.Order;
  return {
    external_id: o.id?.toString(),
    valor: parseFloat(o.total || "0"),
    email: o.email,
    telefone: o.cellphone,
    status: o.status,
    produtos: (o.products || []).map(i => ({
      sku: i.reference || "N/A",
      nome: i.name || "Produto Tray",
      qtd: Number(i.quantity) || 1,
    })),
    cupom: o.coupon,
  };
}

function normalizeYampi(raw: z.infer<typeof YampiOrderSchema>): NormalizedOrder {
  return {
    external_id: raw.id?.toString(),
    valor: raw.value_total || 0,
    email: raw.customer?.email,
    telefone: raw.customer?.phone?.full_number,
    status: raw.status?.name,
    produtos: (raw.items || []).map(i => ({
      sku: i.sku || "N/A",
      nome: i.name || "Produto Yampi",
      qtd: i.quantity || 1,
    })),
    cupom: raw.cupom?.code,
  };
}

// --- Main Handler ---
serve(async (req) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const parsedReq = await validateRequest(req, { method: "POST", maxBytes: 256 * 1024 });
  if (!parsedReq.ok) return parsedReq.response;

  const expectedSecret = Deno.env.get("INTEGRATION_GATEWAY_SECRET") ?? "";
  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: "INTEGRATION_GATEWAY_SECRET missing" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!providedSecret || providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized webhook" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const paramsResult = QueryParamsSchema.safeParse({
    platform: url.searchParams.get("platform")?.toLowerCase(),
    loja_id: url.searchParams.get("loja_id"),
  });

  if (!paramsResult.success) {
    return new Response(
      JSON.stringify({ error: "Parâmetros inválidos", details: paramsResult.error.flatten().fieldErrors }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const { platform, loja_id: storeId } = paramsResult.data;

  const ip = getClientIp(req);
  const rateKey = `integration-gateway:${storeId}:${ip}`;
  const limit = await checkDistributedRateLimit(
    supabase,
    rateKey,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.allowed) {
    await writeAuditLog(supabase, {
      action: "rate_limit_block",
      resource: "integration-gateway",
      result: "failure",
      ip,
      tenant_id: storeId,
      metadata: { request_id: requestId, platform },
    });
    return rateLimitedResponseWithRetry(limit.retryAfterSeconds);
  }

  let rawBody: any = {};
  try { rawBody = await req.json(); } catch { /* empty body */ }
  if (rawBody && typeof rawBody === "object") {
    if (Object.keys(rawBody).length > 200) return errorResponse("Payload has too many keys", 400);
    if (JSON.stringify(rawBody).length > 200 * 1024) return errorResponse("Payload too large", 413);
  }

  try {
    const { data: store, error: storeErr } = await supabase.from("stores").select("user_id").eq("id", storeId).single();
    if (storeErr || !store?.user_id) {
      return new Response(JSON.stringify({ error: "Loja/store não encontrada", store_id: storeId }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let normalizedOrder: NormalizedOrder | null = null;

    // --- LOG ---
    const { data: logEntry } = await supabase.from("webhook_logs").insert({
      event_type: "ecommerce_order",
      source: platform,
      status: "received",
      store_id: storeId,
      user_id: store.user_id,
      plataforma: platform,
      payload_bruto: rawBody,
    }).select().single();

    // --- Normalize by platform ---
    switch (platform) {
      case "shopify": {
        const parsed = ShopifyOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload Shopify inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeShopify(parsed.data);
        break;
      }
      case "nuvemshop": {
        const parsed = NuvemshopOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload Nuvemshop inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeNuvemshop(parsed.data);
        break;
      }
      case "shopee": {
        const parsed = ShopeeOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload Shopee inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeShopee(parsed.data);
        break;
      }
      case "vtex": {
        const parsed = VtexOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload VTEX inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeVtex(parsed.data);
        break;
      }
      case "woocommerce": {
        const parsed = WooCommerceOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload WooCommerce inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeWooCommerce(parsed.data);
        break;
      }
      case "tray": {
        const parsed = TrayOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload Tray inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeTray(parsed.data);
        break;
      }
      case "yampi": {
        const parsed = YampiOrderSchema.safeParse(rawBody);
        if (!parsed.success) throw new Error(`Payload Yampi inválido: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        normalizedOrder = normalizeYampi(parsed.data);
        break;
      }
      case "custom":
        // Custom platform — log only, no normalization
        await supabase.from("webhook_logs").update({ status_processamento: "custom_recebido" }).eq("id", logEntry?.id);
        console.log(`[${requestId}] integration-gateway custom platform=${platform} store=${storeId} elapsed_ms=${Date.now() - startedAt}`);
        return new Response(JSON.stringify({ success: true, message: "Custom webhook logged", request_id: requestId }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (normalizedOrder) {
      // 1. Idempotency check
      const { data: existing } = await supabase
        .from("orders_v3")
        .select("id")
        .eq("pedido_externo_id", normalizedOrder.external_id)
        .eq("store_id", storeId)
        .maybeSingle();

      if (existing) {
        await supabase.from("webhook_logs").update({ status_processamento: "ignorado", erro_mensagem: "Pedido duplicado" }).eq("id", logEntry?.id);
        return new Response(JSON.stringify({ success: true, message: "Duplicate ignored" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // 2. Upsert customer (customers_v3: conflito store_id+phone ou store_id+email)
      let clienteId: string | null = null;
      const phoneNorm = normalizedOrder.telefone ? normalizePhoneBr(normalizedOrder.telefone) : "";
      const emailTrim = normalizedOrder.email?.trim() || null;
      const nameBase = emailTrim?.split("@")[0] || (phoneNorm.length >= 12 ? phoneNorm : "Cliente");

      if (phoneNorm.length >= 12) {
        const { data: row } = await supabase
          .from("customers_v3")
          .upsert(
            {
              user_id: store.user_id,
              store_id: storeId,
              phone: phoneNorm,
              email: emailTrim,
              name: nameBase,
            },
            { onConflict: "store_id,phone" },
          )
          .select("id")
          .single();
        if (row?.id) clienteId = row.id;
      } else if (emailTrim) {
        const { data: row } = await supabase
          .from("customers_v3")
          .upsert(
            {
              user_id: store.user_id,
              store_id: storeId,
              phone: null,
              email: emailTrim,
              name: nameBase,
            },
            { onConflict: "store_id,email" },
          )
          .select("id")
          .single();
        if (row?.id) clienteId = row.id;
      }

      // 3. Insert order (sempre que idempotente; cliente opcional)
      const { error: orderInsErr } = await supabase.from("orders_v3").insert({
        store_id: storeId,
        user_id: store.user_id,
        cliente_id: clienteId,
        pedido_externo_id: normalizedOrder.external_id,
        valor: normalizedOrder.valor,
        valor_desconto: normalizedOrder.valor_desconto ?? null,
        valor_frete: normalizedOrder.valor_frete ?? null,
        payment_method: normalizedOrder.payment_method ?? null,
        payment_installments: normalizedOrder.payment_installments ?? null,
        internal_status: mapInternalStatus(platform, normalizedOrder.status),
        status: normalizedOrder.status,
        produtos_json: normalizedOrder.produtos,
        cupom_utilizado: normalizedOrder.cupom,
        utm_source: normalizedOrder.utm_source,
        utm_medium: normalizedOrder.utm_medium,
        utm_campaign: normalizedOrder.utm_campaign,
      });

      if (orderInsErr) {
        throw new Error(orderInsErr.message);
      }

      const intStatus = mapInternalStatus(platform, normalizedOrder.status);
      if (intStatus === "paid_or_processing") {
        await markAbandonedCartsRecoveredAndCancelSchedule(supabase, {
          storeId,
          userId: store.user_id,
          clienteId,
          phoneNorm,
          orderValue: normalizedOrder.valor,
          requestId,
        });
      }

      // Jornada «Fidelidade — Pontos»: primeiro registo já pago (transições pending→paid não passam aqui por idempotência)
      if (clienteId && intStatus === "paid_or_processing") {
        invokeFlowEngine(new URL(req.url).origin, {
          event: "loyalty_points",
          store_id: storeId,
          customer_id: clienteId,
          payload: {
            recovery_url: "",
            order_id: String(normalizedOrder.external_id ?? ""),
            order_value: normalizedOrder.valor,
          },
        }).catch((e) => console.warn(`[${requestId}] loyalty_points flow-engine:`, e));
      }

      if (intStatus === "cancelled") {
        const { error: evErr } = await supabase.from("order_events").insert({
          store_id: storeId,
          user_id: store.user_id,
          pedido_externo_id: String(normalizedOrder.external_id ?? ""),
          event_type: "cancelled",
          reason: normalizedOrder.status ?? null,
          raw_payload: rawBody,
        });
        if (evErr) console.warn(`[${requestId}] order_events:`, evErr.message);
      }

      // 4. Attribution (cupom IA ou UTM) — telefone BR normalizado obrigatório na tabela
      const phAttr = phoneNorm.length >= 12 ? phoneNorm : "";
      const hasUtm = !!(normalizedOrder.utm_source || normalizedOrder.utm_campaign);
      let fromAiCoupon = false;
      if (normalizedOrder.cupom) {
        const { data: aiCoupon } = await supabase
          .from("ai_generated_coupons")
          .select("code")
          .eq("code", normalizedOrder.cupom)
          .maybeSingle();
        fromAiCoupon = !!aiCoupon;
      }
      if (phAttr && (fromAiCoupon || hasUtm)) {
        const { error: attErr } = await supabase.from("attribution_events").upsert(
          {
            user_id: store.user_id,
            order_id: String(normalizedOrder.external_id),
            customer_phone: phAttr,
            order_value: normalizedOrder.valor,
            source_platform: platform,
            utm_source: normalizedOrder.utm_source ?? null,
            utm_medium: normalizedOrder.utm_medium ?? null,
            utm_campaign: normalizedOrder.utm_campaign ?? null,
            attributed_message_id: null,
            order_date: new Date().toISOString(),
          },
          { onConflict: "user_id,order_id,source_platform" },
        );
        if (attErr) console.warn(`[${requestId}] attribution_events upsert:`, attErr.message);
      }

      await supabase.from("webhook_logs").update({ status_processamento: "sucesso" }).eq("id", logEntry?.id);
    }

    console.log(`[${requestId}] integration-gateway ok platform=${platform} store=${storeId} elapsed_ms=${Date.now() - startedAt}`);
    await writeAuditLog(supabase, {
      action: "webhook_ingest",
      resource: "integration-gateway",
      result: "success",
      ip,
      tenant_id: storeId,
      metadata: { request_id: requestId, platform },
    });
    return new Response(JSON.stringify({ success: true, request_id: requestId }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error(`[${requestId}] Webhook Error:`, e?.message ?? e);
    await writeAuditLog(supabase, {
      action: "webhook_ingest",
      resource: "integration-gateway",
      result: "failure",
      ip,
      tenant_id: storeId,
      metadata: { request_id: requestId, reason: e?.message ?? "unknown" },
    });
    return new Response(JSON.stringify({ error: "Internal server error", request_id: requestId }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
