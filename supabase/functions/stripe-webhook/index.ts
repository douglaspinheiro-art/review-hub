/**
 * Stripe Webhooks — idempotente, atualiza `profiles` (plano + ids Stripe).
 * POST /functions/v1/stripe-webhook  (verify_jwt = false; validação por assinatura Stripe)
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Opcional: STRIPE_PRICE_TO_PLAN — JSON { "price_xxx": "growth" }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, stripe-signature, content-type",
};

function planFromMetadata(meta: Stripe.Metadata | null | undefined): string | null {
  const raw = meta?.plan_tier ?? meta?.plan ?? meta?.planTier;
  const p = String(raw ?? "").toLowerCase();
  if (["starter", "growth", "scale", "enterprise"].includes(p)) return p;
  return null;
}

function planFromPriceMap(priceId: string | undefined, mapJson: string): string | null {
  if (!priceId) return null;
  try {
    const map = JSON.parse(mapJson) as Record<string, string>;
    const v = map[priceId];
    if (v && ["starter", "growth", "scale", "enterprise"].includes(String(v).toLowerCase())) {
      return String(v).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function syncProfileFromSubscription(
  admin: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
  priceMapJson: string,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const metaPlan = planFromMetadata(sub.metadata);
  const mapped = planFromPriceMap(priceId, priceMapJson);
  const plan = metaPlan ?? mapped;

  const status = (sub.status ?? "").toLowerCase();
  const downgrade =
    status === "canceled" || status === "unpaid" || status === "incomplete_expired" || status === "paused";

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (downgrade) {
    patch.stripe_subscription_id = null;
    patch.plan = "starter";
  } else {
    patch.stripe_subscription_id = sub.id;
    if (plan) patch.plan = plan;
  }

  const { error } = await admin.from("profiles").update(patch).eq("stripe_customer_id", customerId);
  if (error) console.error("[stripe-webhook] profiles update by customer:", error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!secret.trim() || !stripeKey.trim()) {
    return new Response(JSON.stringify({ error: "Stripe webhook não configurado" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const stripe = new Stripe(stripeKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: `Assinatura inválida: ${msg}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const priceMapJson = Deno.env.get("STRIPE_PRICE_TO_PLAN") ?? "{}";

  const { error: insEvErr } = await admin.from("stripe_webhook_events").insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (insEvErr) {
    if (String(insEvErr.code) === "23505" || insEvErr.message?.includes("duplicate")) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[stripe-webhook] insert event:", insEvErr.message);
    return new Response(JSON.stringify({ error: "Persistência falhou" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncProfileFromSubscription(admin, sub, priceMapJson);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Session;
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (userId && customerId) {
          const patch: Record<string, unknown> = {
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          };
          if (subId) patch.stripe_subscription_id = subId;
          const metaPlan = planFromMetadata(session.metadata);
          if (metaPlan) patch.plan = metaPlan;
          const { error } = await admin.from("profiles").update(patch).eq("id", userId);
          if (error) console.error("[stripe-webhook] checkout session profile:", error.message);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
