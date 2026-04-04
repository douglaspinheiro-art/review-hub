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

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform"); 
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
          produtos: rawBody.line_items?.map((i: any) => ({ sku: i.sku, nome: i.title, qtd: i.quantity }))
        };
        break;

      case "nuvemshop":
        normalizedOrder = {
          external_id: rawBody.id?.toString(),
          valor: parseFloat(rawBody.total || "0"),
          email: rawBody.contact_email,
          telefone: rawBody.contact_phone,
          status: rawBody.status,
          produtos: rawBody.products?.map((i: any) => ({ sku: i.sku, nome: i.name, qtd: i.quantity }))
        };
        break;

      case "mercado_livre":
        // ML envia apenas a URL do recurso. Em um cenário real, precisaríamos do Token da loja.
        // Aqui simulamos a normalização se o payload fosse completo.
        if (rawBody.resource) {
          normalizedOrder = {
            external_id: rawBody.resource.split('/').pop(),
            valor: rawBody.total_amount || 0,
            email: rawBody.buyer?.email || `ml_${rawBody.buyer?.id}@user.com`,
            status: 'paid',
            produtos: []
          };
        }
        break;

      case "shopee":
        normalizedOrder = {
          external_id: rawBody.order_sn,
          valor: rawBody.total_amount,
          email: rawBody.buyer_username + "@shopee.com",
          status: 'completed',
          produtos: rawBody.item_list?.map((i: any) => ({ sku: i.item_sku, nome: i.item_name, qtd: i.model_quantity_purchased }))
        };
        break;

      case "vtex":
        normalizedOrder = {
          external_id: rawBody.orderId,
          valor: rawBody.value / 100, // VTEX envia em centavos
          email: rawBody.clientProfileData?.email,
          status: rawBody.status,
          produtos: rawBody.items?.map((i: any) => ({ sku: i.id, nome: i.name, qtd: i.quantity }))
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
        email: normalizedOrder.email,
        telefone: normalizedOrder.telefone,
        nome: normalizedOrder.email?.split('@')[0] || "Cliente Marketplace",
      }, { onConflict: 'loja_id, email' }).select().single();

      // 3. Inserir Pedido
      if (cliente) {
        // Buscar o user_id dono desta loja
        const { data: loja } = await supabase.from("lojas").select("user_id").eq("id", lojaId).single();

        await supabase.from("pedidos_v3").insert({
          loja_id: lojaId,
          user_id: loja?.user_id,
          cliente_id: cliente.id,
          pedido_externo_id: normalizedOrder.external_id,
          valor: normalizedOrder.valor,
          status: normalizedOrder.status,
          produtos_json: normalizedOrder.produtos
        });

        await supabase.from("webhook_logs").update({ status_processamento: 'sucesso' }).eq("id", logEntry.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Webhook Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});
