import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Rate Limiting (in-memory, per-instance) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 60; // 60 requests por minuto por loja

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// --- Zod Schemas ---
const QueryParamsSchema = z.object({
  platform: z.enum(["shopify", "nuvemshop", "vtex", "woocommerce", "tray", "yampi", "shopee", "custom"]),
  loja_id: z.string().uuid("loja_id deve ser UUID válido"),
});

const ShopifyOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  total_price: z.string().optional().default("0"),
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
}

function normalizeShopify(raw: z.infer<typeof ShopifyOrderSchema>): NormalizedOrder {
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

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

  const { platform, loja_id: lojaId } = paramsResult.data;

  // Rate limit check
  if (!checkRateLimit(lojaId)) {
    return new Response(
      JSON.stringify({ error: "Rate limit excedido. Tente novamente em 1 minuto." }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" } }
    );
  }

  let rawBody: any = {};
  try { rawBody = await req.json(); } catch { /* empty body */ }

  try {
    let normalizedOrder: NormalizedOrder | null = null;

    // --- LOG ---
    const { data: logEntry } = await supabase.from("webhook_logs").insert({
      plataforma: platform,
      loja_id: lojaId,
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
        return new Response(JSON.stringify({ success: true, message: "Custom webhook logged" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (normalizedOrder) {
      // 1. Idempotency check
      const { data: existing } = await supabase
        .from("pedidos_v3")
        .select("id")
        .eq("pedido_externo_id", normalizedOrder.external_id)
        .eq("loja_id", lojaId)
        .maybeSingle();

      if (existing) {
        await supabase.from("webhook_logs").update({ status_processamento: "ignorado", erro_mensagem: "Pedido duplicado" }).eq("id", logEntry?.id);
        return new Response(JSON.stringify({ success: true, message: "Duplicate ignored" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // 2. Upsert customer
      const { data: loja } = await supabase.from("lojas").select("user_id").eq("id", lojaId).single();
      const { data: cliente } = await supabase.from("clientes").upsert({
        loja_id: lojaId,
        user_id: loja?.user_id,
        email: normalizedOrder.email,
        telefone: normalizedOrder.telefone,
        nome: normalizedOrder.email?.split("@")[0] || "Cliente",
      }, { onConflict: "loja_id, email" }).select().single();

      // 3. Insert order with attribution
      if (cliente) {
        await supabase.from("pedidos_v3").insert({
          loja_id: lojaId,
          user_id: loja?.user_id,
          cliente_id: cliente.id,
          pedido_externo_id: normalizedOrder.external_id,
          valor: normalizedOrder.valor,
          status: normalizedOrder.status,
          produtos_json: normalizedOrder.produtos,
          cupom_utilizado: normalizedOrder.cupom,
          utm_source: normalizedOrder.utm_source,
          utm_medium: normalizedOrder.utm_medium,
          utm_campaign: normalizedOrder.utm_campaign,
        });

        // 4. AI coupon attribution
        if (normalizedOrder.cupom) {
          const { data: aiCoupon } = await supabase
            .from("ai_generated_coupons")
            .select("contact_id, user_id")
            .eq("code", normalizedOrder.cupom)
            .maybeSingle();

          if (aiCoupon) {
            await supabase.from("attribution_events").insert({
              user_id: loja?.user_id,
              order_id: normalizedOrder.external_id,
              customer_phone: normalizedOrder.telefone,
              order_value: normalizedOrder.valor,
              source_platform: platform,
              attributed_message_id: null,
              order_date: new Date().toISOString(),
            });
          }
        }

        await supabase.from("webhook_logs").update({ status_processamento: "sucesso" }).eq("id", logEntry?.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Webhook Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
