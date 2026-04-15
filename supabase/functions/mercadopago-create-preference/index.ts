import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * mercadopago-create-preference
 * Creates a Mercado Pago preference for transparent checkout.
 * Supports: Credit Card, PIX, Boleto, ML Wallet.
 *
 * Body: { plan_key, billing_cycle, user_id? }
 * Secrets: MERCADOPAGO_ACCESS_TOKEN, APP_URL
 */

const PLAN_PRICES: Record<string, { monthly: number; annual: number; name: string }> = {
  starter: { monthly: 497, annual: 397, name: "Starter" },
  growth:  { monthly: 997, annual: 797, name: "Growth" },
  scale:   { monthly: 2497, annual: 1997, name: "Scale" },
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
      return new Response(
        JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate JWT
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
    const planKey = String(body.plan_key ?? "").toLowerCase();
    const cycle = String(body.billing_cycle ?? "monthly").toLowerCase();

    const plan = PLAN_PRICES[planKey];
    if (!plan) {
      return new Response(JSON.stringify({ error: `Plano inválido: ${planKey}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = cycle === "annual" ? plan.annual : plan.monthly;
    const appUrl = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";

    const preference = {
      items: [
        {
          title: `LTV Boost — Plano ${plan.name} (${cycle === "annual" ? "Anual" : "Mensal"})`,
          quantity: 1,
          unit_price: price,
          currency_id: "BRL",
        },
      ],
      payer: {
        email: user.email,
      },
      payment_methods: {
        excluded_payment_types: [],
        installments: 12,
      },
      back_urls: {
        success: `${appUrl}/dashboard/billing?mp_status=approved`,
        failure: `${appUrl}/dashboard/billing?mp_status=failure`,
        pending: `${appUrl}/dashboard/billing?mp_status=pending`,
      },
      auto_return: "approved",
      external_reference: JSON.stringify({
        user_id: user.id,
        plan_key: planKey,
        billing_cycle: cycle,
      }),
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      metadata: {
        user_id: user.id,
        plan_tier: planKey,
        billing_cycle: cycle,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("[mp-create-preference] MP error:", JSON.stringify(mpData));
      return new Response(
        JSON.stringify({ error: mpData.message ?? "Erro ao criar preferência no Mercado Pago" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        preference_id: mpData.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[mp-create-preference] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
