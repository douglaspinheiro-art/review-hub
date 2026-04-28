import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * wa-pack-purchase
 * Cria preferência Mercado Pago para compra de pacote de mensagens WhatsApp.
 * Auth: JWT do usuário. Valida que a loja pertence ao usuário.
 * external_reference codifica { user_id, store_id, pack_id, type:"wa_pack" }
 * para o webhook creditar via wa_wallet_credit_pack.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpToken?.trim()) {
      return new Response(JSON.stringify({ error: "MP não configurado" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const storeId = String(body.store_id ?? "");
    const packId = String(body.pack_id ?? "");
    if (!storeId || !packId) {
      return new Response(JSON.stringify({ error: "store_id e pack_id obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Garante ownership da loja
    const { data: store } = await supabase
      .from("stores")
      .select("id, user_id, name")
      .eq("id", storeId)
      .maybeSingle();
    if (!store || store.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Loja não encontrada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida pack ativo
    const { data: pack } = await supabase
      .from("wa_message_packs")
      .select("id, sku, name, messages_count, price_brl, active")
      .eq("id", packId)
      .maybeSingle();
    if (!pack || !pack.active) {
      return new Response(JSON.stringify({ error: "Pacote indisponível" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
    const externalRef = JSON.stringify({
      type: "wa_pack",
      user_id: user.id,
      store_id: storeId,
      pack_id: pack.id,
    });

    const preference = {
      items: [{
        title: `${pack.name} — ${store.name ?? "loja"}`,
        quantity: 1,
        unit_price: Number(pack.price_brl),
        currency_id: "BRL",
      }],
      payer: { email: user.email },
      external_reference: externalRef,
      metadata: {
        type: "wa_pack",
        store_id: storeId,
        pack_id: pack.id,
        user_id: user.id,
        messages_count: pack.messages_count,
      },
      back_urls: {
        success: `${appUrl}/dashboard/whatsapp/consumo?pack=approved`,
        failure: `${appUrl}/dashboard/whatsapp/consumo?pack=failure`,
        pending: `${appUrl}/dashboard/whatsapp/consumo?pack=pending`,
      },
      auto_return: "approved",
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
    };

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(preference),
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error("[wa-pack-purchase] MP error:", r.status, errText);
      return new Response(JSON.stringify({ error: "Falha ao criar preferência" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pref = await r.json();
    return new Response(JSON.stringify({
      preference_id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[wa-pack-purchase] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});