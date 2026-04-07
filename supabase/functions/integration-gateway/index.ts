import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const VALID_PLATFORMS = ["shopify", "nuvemshop", "vtex", "woocommerce", "tray", "yampi", "shopee", "custom"];

  const url = new URL(req.url);
  const platformRaw = url.searchParams.get("platform");
  const platform = platformRaw && VALID_PLATFORMS.includes(platformRaw.toLowerCase())
    ? platformRaw.toLowerCase()
    : null;
  const lojaId = url.searchParams.get("loja_id");

  let rawBody = {};
  try { rawBody = await req.json(); } catch (e) { /* silent */ }

  try {
    if (!lojaId || !platform) throw new Error("Parâmetros loja_id ou platform ausentes.");

    let normalizedOrder = null;

    // --- LOG INICIAL ---
    const { data: logEntry } = await supabase.from("webhook_logs").insert({
      plataforma: platform,
      loja_id: lojaId,
      payload_bruto: rawBody
    }).select().single();

    // --- NORMALIZADOR POR PLATAFORMA ---
    switch (platform) {
      case "shopify":
        normalizedOrder = {
          external_id: rawBody.id?.toString(),
          valor: parseFloat(rawBody.total_price || "0"),
          email: rawBody.customer?.email,
          telefone: rawBody.customer?.phone,
          status: rawBody.financial_status,
          produtos: (rawBody.line_items || []).map((i: any) => ({ 
            sku: i.sku || 'N/A', 
            nome: i.title || 'Produto Shopify', 
            qtd: i.quantity || 1 
          })),
          cupom: rawBody.discount_codes?.[0]?.code,
        };
        if (rawBody.landing_site) {
          try {
            const ls = new URL(rawBody.landing_site);
            normalizedOrder.utm_source = ls.searchParams.get("utm_source");
            normalizedOrder.utm_medium = ls.searchParams.get("utm_medium");
            normalizedOrder.utm_campaign = ls.searchParams.get("utm_campaign");
          } catch (e) { /* invalid URL */ }
        }
        break;

      case "nuvemshop":
        normalizedOrder = {
          external_id: rawBody.id?.toString(),
          valor: parseFloat(rawBody.total || "0"),
          email: rawBody.contact_email,
          telefone: rawBody.contact_phone,
          status: rawBody.status,
          produtos: (rawBody.products || []).map((i: any) => ({ 
            sku: i.sku || 'N/A', 
            nome: i.name || 'Produto Nuvemshop', 
            qtd: i.quantity || 1 
          })),
          cupom: rawBody.coupon?.[0]?.code,
          utm_source: rawBody.extra_params?.utm_source
        };
        break;

      case "shopee":
        normalizedOrder = {
          external_id: rawBody.order_sn,
          valor: rawBody.total_amount || 0,
          email: (rawBody.buyer_username || 'shopee_user') + "@shopee.com",
          status: 'completed',
          produtos: (rawBody.item_list || []).map((i: any) => ({ 
            sku: i.item_sku || i.item_id || 'N/A', 
            nome: i.item_name || 'Produto Shopee', 
            qtd: i.model_quantity_purchased || 1 
          }))
        };
        break;

      case "vtex":
        normalizedOrder = {
          external_id: rawBody.orderId,
          valor: (rawBody.value || 0) / 100, 
          email: rawBody.clientProfileData?.email,
          status: rawBody.status,
          produtos: (rawBody.items || []).map((i: any) => ({ 
            sku: i.id || 'N/A', 
            nome: i.name || 'Produto VTEX', 
            qtd: i.quantity || 1 
          })),
          cupom: rawBody.marketingData?.coupon
        };
        break;
    }

    if (normalizedOrder) {
      // 1. Verificar se o pedido já existe (Idempotência)
      const { data: existing } = await supabase
        .from("pedidos_v3")
        .select("id")
        .eq("pedido_externo_id", normalizedOrder.external_id)
        .eq("loja_id", lojaId)
        .maybeSingle();

      if (existing) {
        await supabase.from("webhook_logs").update({ status_processamento: 'ignorado', erro_mensagem: 'Pedido duplicado' }).eq("id", logEntry.id);
        return new Response(JSON.stringify({ success: true, message: "Duplicate ignored" }), { headers: cors });
      }

      // 2. Upsert no Cliente
      const { data: cliente } = await supabase.from("clientes").upsert({
        loja_id: lojaId,
        user_id: (await supabase.from("lojas").select("user_id").eq("id", lojaId).single()).data?.user_id,
        email: normalizedOrder.email,
        telefone: normalizedOrder.telefone,
        nome: normalizedOrder.email?.split('@')[0] || "Cliente Marketplace",
      }, { onConflict: 'loja_id, email' }).select().single();

      // 3. Inserir Pedido com Atribuição
      if (cliente) {
        const { data: loja } = await supabase.from("lojas").select("user_id").eq("id", lojaId).single();

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
          utm_campaign: normalizedOrder.utm_campaign
        });

        // 4. Se houver cupom, verificar se foi gerado pela IA para atribuir à campanha
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
              order_date: new Date().toISOString()
            });
          }
        }

        await supabase.from("webhook_logs").update({ status_processamento: 'sucesso' }).eq("id", logEntry.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Webhook Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});
