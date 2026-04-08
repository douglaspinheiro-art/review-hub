/**
 * LTV Boost v4 — Automation Trigger (Cron Job)
 * Checks for pending abandoned carts and triggers the flow engine
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("TRIGGER_AUTOMATIONS_SECRET") ?? "";
  if (!bearer) return false;
  if (serviceKey && bearer === serviceKey) return true;
  if (cronSecret && bearer === cronSecret) return true;
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!isAuthorized(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Find pending abandoned carts older than 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data: pendingCarts } = await supabase
      .from("abandoned_carts")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", fifteenMinutesAgo)
      .limit(50);

    const results = [];
    const cadenceMinutes = [60, 12 * 60, 48 * 60];
    const highTicketThreshold = Number(Deno.env.get("HIGH_TICKET_THRESHOLD_BRL") ?? "800");

    for (const cart of (pendingCarts || [])) {
      // Atomic claim to avoid duplicate processing across concurrent workers.
      const { data: claimedCart, error: claimError } = await supabase
        .from("abandoned_carts")
        .update({ status: "processing" })
        .eq("id", cart.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) {
        results.push({ cart_id: cart.id, status: "failed", error: claimError.message });
        continue;
      }
      if (!claimedCart) {
        results.push({ cart_id: cart.id, status: "skipped", reason: "already_claimed" });
        continue;
      }

      // 2. Call Flow Engine for this cart
      const flowRes = await fetch(`${new URL(req.url).origin}/functions/v1/flow-engine`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({ 
          event: 'cart_abandoned', 
          store_id: cart.store_id, 
          customer_id: cart.customer_id,
          payload: { recovery_url: cart.recovery_url, value: cart.cart_value }
        })
      });

      if (flowRes.ok) {
        const cartMetaKey = String(cart.id);
        const { data: existingCadence } = await (supabase as any)
          .from("scheduled_messages")
          .select("id")
          .eq("metadata->>cart_id", cartMetaKey)
          .limit(1);

        if ((existingCadence ?? []).length > 0) {
          await supabase
            .from("abandoned_carts")
            .update({ status: "message_sent", message_sent_at: new Date().toISOString() })
            .eq("id", cart.id);
          results.push({ cart_id: cart.id, status: "skipped", reason: "cadence_already_queued" });
          continue;
        }

        // 3. Queue standard cadence 1h / 12h / 48h for recovery
        const scheduledPayload = cadenceMinutes.map((minutes, idx) => ({
          user_id: cart.user_id,
          store_id: cart.store_id,
          customer_id: cart.customer_id,
          journey_id: cart.automation_id,
          message_content:
            idx === 0
              ? `Oi! Seu carrinho ainda está te esperando. Finalize aqui: ${cart.recovery_url ?? ""}`
              : idx === 1
                ? `Ainda quer seus itens? Posso te ajudar com frete, tamanho ou pagamento. ${cart.recovery_url ?? ""}`
                : `Último lembrete: reservamos seu carrinho por pouco tempo. ${cart.recovery_url ?? ""}`,
          scheduled_for: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
          status: "pending",
          metadata: {
            cadence_step: idx + 1,
            cadence_total: cadenceMinutes.length,
            cart_id: cart.id,
            recovery_url: cart.recovery_url,
            cart_value: cart.cart_value,
            escalation_recommended: Number(cart.cart_value ?? 0) >= highTicketThreshold,
          },
        }));

        const { error: scheduleErr } = await (supabase as any)
          .from("scheduled_messages")
          .insert(scheduledPayload);

        if (scheduleErr) {
          await supabase
            .from("abandoned_carts")
            .update({ status: "pending" })
            .eq("id", cart.id);
          results.push({ cart_id: cart.id, status: "failed", error: scheduleErr.message });
          continue;
        }

        // 4. Mark cart queued for journey
        await supabase
          .from("abandoned_carts")
          .update({ status: "message_sent", message_sent_at: new Date().toISOString() })
          .eq("id", cart.id);

        results.push({
          cart_id: cart.id,
          status: "success",
          cadence_queued: cadenceMinutes.length,
          escalation_recommended: Number(cart.cart_value ?? 0) >= highTicketThreshold,
        });
      } else {
        await supabase
          .from("abandoned_carts")
          .update({ status: "pending" })
          .eq("id", cart.id);
        results.push({ cart_id: cart.id, status: "failed", error: await flowRes.text() });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
