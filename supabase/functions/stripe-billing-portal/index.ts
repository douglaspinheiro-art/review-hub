import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

/**
 * Cria sessão do Stripe Customer Portal para o utilizador autenticado.
 * Requer `profiles.stripe_customer_id` e secret `STRIPE_SECRET_KEY`.
 * `STRIPE_BILLING_PORTAL_RETURN_URL` — URL para onde o Stripe redireciona após sair do portal.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const returnUrl = Deno.env.get("STRIPE_BILLING_PORTAL_RETURN_URL");
  if (!stripeKey?.trim()) return errorResponse("STRIPE_SECRET_KEY não configurada", 503);
  if (!returnUrl?.trim()) return errorResponse("STRIPE_BILLING_PORTAL_RETURN_URL não configurada", 503);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", auth.userId)
    .maybeSingle();

  if (pErr) return errorResponse(pErr.message, 500);
  const customerId = (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId?.trim()) {
    return errorResponse(
      "Conta Stripe ainda não associada. Conclua a subscrição ou contacte o suporte.",
      400,
    );
  }

  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", returnUrl);

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return errorResponse((json as { error?: { message?: string } }).error?.message ?? "Stripe error", 502);
  }
  const url = (json as { url?: string }).url;
  if (!url) return errorResponse("Resposta Stripe inválida", 502);
  return jsonResponse({ url });
});
