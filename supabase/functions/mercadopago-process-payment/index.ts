import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * mercadopago-process-payment
 * Transparent checkout: receives Brick payload (card token OR pix/boleto data) and
 * creates a payment via Mercado Pago /v1/payments. The existing webhook activates
 * the subscription via external_reference.
 *
 * Body: { plan_key, billing_cycle, payment_data }  (payment_data = Brick onSubmit formData)
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
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpToken?.trim()) {
      return new Response(JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const planKey = String(body.plan_key ?? "").toLowerCase();
    const cycle = String(body.billing_cycle ?? "monthly").toLowerCase();
    const paymentData = body.payment_data ?? {};

    const plan = PLAN_PRICES[planKey];
    if (!plan) {
      return new Response(JSON.stringify({ error: `Plano inválido: ${planKey}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const price = cycle === "annual" ? plan.annual : plan.monthly;
    const externalReference = JSON.stringify({
      user_id: user.id, plan_key: planKey, billing_cycle: cycle,
    });
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`;

    // Brick formData shape: { token, issuer_id, payment_method_id, transaction_amount,
    //   installments, payer: { email, identification: { type, number } } }
    // For PIX/boleto: { payment_method_id: "pix"|"bolbradesco", payer: {...} }
    const paymentBody: Record<string, unknown> = {
      transaction_amount: Number(paymentData.transaction_amount ?? price),
      description: `LTV Boost — Plano ${plan.name} (${cycle === "annual" ? "Anual" : "Mensal"})`,
      payment_method_id: paymentData.payment_method_id,
      external_reference: externalReference,
      notification_url: notificationUrl,
      metadata: { user_id: user.id, plan_tier: planKey, billing_cycle: cycle },
      payer: {
        email: paymentData.payer?.email ?? user.email,
        ...(paymentData.payer?.identification ? { identification: paymentData.payer.identification } : {}),
        ...(paymentData.payer?.first_name ? { first_name: paymentData.payer.first_name } : {}),
        ...(paymentData.payer?.last_name  ? { last_name:  paymentData.payer.last_name  } : {}),
      },
    };
    if (paymentData.token) paymentBody.token = paymentData.token;
    if (paymentData.installments) paymentBody.installments = Number(paymentData.installments);
    if (paymentData.issuer_id) paymentBody.issuer_id = paymentData.issuer_id;

    const idempotencyKey = `${user.id}:${planKey}:${cycle}:${Date.now()}`;

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(paymentBody),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("[mp-process-payment] MP error:", JSON.stringify(mpData));
      return new Response(JSON.stringify({
        error: mpData.message ?? "Erro ao processar pagamento",
        cause: mpData.cause ?? null,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tx = mpData.point_of_interaction?.transaction_data ?? {};
    return new Response(JSON.stringify({
      payment_id: mpData.id,
      status: mpData.status,
      status_detail: mpData.status_detail,
      qr_code: tx.qr_code ?? null,
      qr_code_base64: tx.qr_code_base64 ?? null,
      ticket_url: tx.ticket_url ?? mpData.transaction_details?.external_resource_url ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[mp-process-payment] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});