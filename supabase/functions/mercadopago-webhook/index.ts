import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * mercadopago-webhook
 * Receives IPN/Webhook notifications from Mercado Pago.
 * verify_jwt = false — authentication via x-signature header.
 *
 * Secrets: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET,
 *          MP_PLAN_TO_TIER (JSON mapping preapproval_plan_id → tier)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-signature, content-type",
};

const VALID_PLANS = ["starter", "growth", "scale", "enterprise"];

/* ---------- helpers ---------- */

function loadPlanToTierMap(): Record<string, string> {
  const raw = Deno.env.get("MP_PLAN_TO_TIER");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[mp-webhook] MP_PLAN_TO_TIER is not valid JSON");
    return {};
  }
}

function planFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  const raw = meta?.plan_tier ?? meta?.plan;
  const p = String(raw ?? "").toLowerCase();
  return VALID_PLANS.includes(p) ? p : null;
}

function planFromExternalRef(ref: string | null | undefined): { userId: string | null; plan: string | null } {
  if (!ref) return { userId: null, plan: null };
  try {
    const obj = JSON.parse(ref);
    return {
      userId: obj.user_id ?? null,
      plan: VALID_PLANS.includes(String(obj.plan_key ?? "").toLowerCase())
        ? String(obj.plan_key).toLowerCase()
        : null,
    };
  } catch {
    return { userId: null, plan: null };
  }
}

/** Resolve tier from preapproval_plan_id via MP_PLAN_TO_TIER secret */
function planFromPlanId(planId: string | null | undefined, map: Record<string, string>): string | null {
  if (!planId) return null;
  const tier = map[planId];
  return tier && VALID_PLANS.includes(tier) ? tier : null;
}

/** Verify MP webhook signature (HMAC-SHA256) */
async function verifySignature(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  if (!secret) return true; // skip if not configured

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !xRequestId) return false;

  // Parse x-signature: "ts=...,v1=..."
  const parts: Record<string, string> = {};
  for (const part of xSignature.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k && v) parts[k.trim()] = v.trim();
  }

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // Extract data.id from body
  let dataId = "";
  try {
    const parsed = JSON.parse(body);
    dataId = String(parsed?.data?.id ?? "");
  } catch {
    return false;
  }

  // Build manifest: id:[data.id];request-id:[x-request-id];ts:[ts];
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === v1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!mpToken?.trim()) {
    return new Response(JSON.stringify({ error: "MP não configurado" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const bodyText = await req.text();

  // Verify webhook signature
  const sigValid = await verifySignature(req, bodyText);
  if (!sigValid) {
    console.warn("[mp-webhook] invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const planMap = loadPlanToTierMap();

  try {
    const body = JSON.parse(bodyText);
    const eventType = body.type ?? body.topic;
    const dataId = body.data?.id ?? body.id;

    if (!dataId) {
      return new Response(JSON.stringify({ received: true, skipped: "no data.id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check
    const eventId = `${eventType}:${dataId}`;
    const { error: insErr } = await admin.from("mp_webhook_events").insert({
      event_id: eventId,
      type: eventType ?? "unknown",
      payload: body,
    });

    if (insErr) {
      if (String(insErr.code) === "23505" || insErr.message?.includes("duplicate")) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[mp-webhook] insert event error:", insErr.message);
    }

    // Handle payment notifications
    if (eventType === "payment") {
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });

      if (!payRes.ok) {
        console.error("[mp-webhook] failed to fetch payment:", payRes.status);
        return new Response(JSON.stringify({ received: true, error: "fetch payment failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payment = await payRes.json();
      const status = String(payment.status ?? "").toLowerCase();
      const extRef = planFromExternalRef(payment.external_reference);
      const metaPlan = planFromMetadata(payment.metadata);
      const plan = metaPlan ?? extRef.plan;
      const userId = extRef.userId ?? payment.metadata?.user_id;
      const mpCustomerId = payment.payer?.id ? String(payment.payer.id) : null;

      if (!userId) {
        console.warn("[mp-webhook] no user_id found in payment", dataId);
        return new Response(JSON.stringify({ received: true, skipped: "no user_id" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (status === "approved") {
        if (plan) patch.plan = plan;
        if (mpCustomerId) patch.mp_customer_id = mpCustomerId;
        patch.subscription_status = "active";
        console.log(`[mp-webhook] payment approved for user ${userId}, plan: ${plan}`);
      } else if (status === "cancelled" || status === "refunded" || status === "rejected") {
        patch.plan = "starter";
        patch.mp_subscription_id = null;
        patch.subscription_status = status === "rejected" ? "past_due" : "canceled";
        console.log(`[mp-webhook] payment ${status} for user ${userId}, downgrade to starter`);
      } else {
        console.log(`[mp-webhook] payment status ${status} for user ${userId}, no action`);
        return new Response(JSON.stringify({ received: true, status }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Capture previous status for audit
      const { data: prevProfile } = await admin
        .from("profiles")
        .select("subscription_status, plan")
        .eq("id", userId)
        .maybeSingle();
      const prevStatus = prevProfile?.subscription_status ?? null;
      const prevPlan = prevProfile?.plan ?? null;

      // Update with retry/backoff (3 attempts)
      let updErr: { message?: string } | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error } = await admin.from("profiles").update(patch).eq("id", userId);
        if (!error) {
          updErr = null;
          break;
        }
        updErr = error;
        console.warn(`[mp-webhook] profile update attempt ${attempt} failed:`, error.message);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 200 * attempt));
      }

      if (updErr) {
        console.error("[mp-webhook] profile update FAILED after retries:", updErr.message);
        // Audit log for dead-letter visibility
        await admin.from("audit_logs").insert({
          user_id: userId,
          action: "mp_payment_update_failed",
          resource: "profiles",
          result: "error",
          metadata: {
            payment_id: String(dataId),
            error: updErr.message,
            patch,
          },
        });
      } else {
        // Audit transition (e.g., diagnostic_only → active)
        const newStatus = patch.subscription_status as string | undefined;
        if (newStatus && prevStatus !== newStatus) {
          await admin.from("audit_logs").insert({
            user_id: userId,
            action: "subscription_status_changed",
            resource: "profiles",
            result: "success",
            metadata: {
              payment_id: String(dataId),
              from_status: prevStatus,
              to_status: newStatus,
              from_plan: prevPlan,
              to_plan: patch.plan ?? prevPlan,
              source: "mercadopago_webhook",
            },
          });
        }
      }
    }

    // Handle subscription (preapproval) notifications
    if (eventType === "subscription_preapproval" || eventType === "subscription_authorized_payment") {
      const subRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });

      if (subRes.ok) {
        const sub = await subRes.json();
        const status = String(sub.status ?? "").toLowerCase();
        const extRef = planFromExternalRef(sub.external_reference);
        const userId = extRef.userId ?? sub.metadata?.user_id ?? sub.payer_id;

        // Resolve plan: external_reference > preapproval_plan_id map > metadata
        const resolvedPlan =
          extRef.plan ??
          planFromPlanId(sub.preapproval_plan_id, planMap) ??
          planFromMetadata(sub.metadata);

        if (userId) {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

          if (status === "authorized" || status === "active") {
            patch.mp_subscription_id = sub.id;
            if (resolvedPlan) patch.plan = resolvedPlan;
            patch.subscription_status = "active";
            console.log(`[mp-webhook] subscription ${status} for user ${userId}, plan: ${resolvedPlan}`);
          } else if (status === "cancelled" || status === "paused") {
            patch.mp_subscription_id = null;
            patch.subscription_status = status === "paused" ? "past_due" : "canceled";
            if (status === "cancelled") patch.plan = "starter";
            console.log(`[mp-webhook] subscription ${status} for user ${userId}`);
          }

          const { error } = await admin.from("profiles").update(patch).eq("id", userId);
          if (error) console.error("[mp-webhook] subscription update error:", error.message);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[mp-webhook] error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
