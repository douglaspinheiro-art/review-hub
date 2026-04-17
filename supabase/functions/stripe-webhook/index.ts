// Stripe webhook → ativa profiles.subscription_status = 'active' no checkout.session.completed
// Deploy com verify_jwt = false. Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_TO_PLAN (opcional, JSON).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

type PlanTier = "starter" | "growth" | "scale" | "enterprise";

function parsePriceMap(): Record<string, PlanTier> {
  try {
    const raw = Deno.env.get("STRIPE_PRICE_TO_PLAN");
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PlanTier>;
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sig = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!sig || !secret || !stripeKey) {
    return new Response(JSON.stringify({ error: "missing_config" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch (err) {
    return new Response(JSON.stringify({ error: `invalid_signature: ${(err as Error).message}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const priceMap = parsePriceMap();

  async function activate(userId: string, plan: PlanTier | null) {
    const update: Record<string, unknown> = { subscription_status: "active" };
    if (plan) update.plan = plan;
    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    if (error) console.error("[stripe-webhook] update profile failed:", error.message);
  }

  async function setStatus(userId: string, status: "past_due" | "canceled") {
    const { error } = await supabase
      .from("profiles")
      .update({ subscription_status: status })
      .eq("id", userId);
    if (error) console.error(`[stripe-webhook] set ${status} failed:`, error.message);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id || (s.metadata?.user_id ?? null);
        if (!userId) {
          console.warn("[stripe-webhook] checkout.session.completed sem client_reference_id");
          break;
        }
        let plan: PlanTier | null = (s.metadata?.plan_tier as PlanTier) ?? null;
        if (!plan && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          const priceId = sub.items.data[0]?.price.id;
          if (priceId && priceMap[priceId]) plan = priceMap[priceId];
        }
        await activate(userId, plan);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.user_id as string) ?? null;
        if (!userId) break;
        if (sub.status === "active" || sub.status === "trialing") {
          const priceId = sub.items.data[0]?.price.id;
          const plan = priceId ? priceMap[priceId] ?? null : null;
          await activate(userId, plan);
        } else if (sub.status === "past_due" || sub.status === "unpaid") {
          await setStatus(userId, "past_due");
        } else if (sub.status === "canceled") {
          await setStatus(userId, "canceled");
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.user_id as string) ?? null;
        if (userId) await setStatus(userId, "canceled");
        break;
      }
      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
