/**
 * LTV Boost v4 — Flow Automation Engine
 * Processes events (cart_abandoned, order_placed) and triggers messages
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { event, store_id, customer_id, payload } = await req.json();

    if (!store_id || !event) throw new Error("Missing store_id or event");

    // 1. Get store configurations (frequency capping, etc)
    const { data: store } = await supabase.from("stores").select("*").eq("id", store_id).single();
    if (!store) throw new Error("Store not found");

    // 2. Identify the automation journeys for this event
    const { data: journeys } = await supabase
      .from("journeys_config")
      .select("*")
      .eq("store_id", store_id)
      .eq("trigger_event", event)
      .eq("is_active", true);

    if (!journeys || journeys.length === 0) {
      return new Response(JSON.stringify({ ok: true, status: "no_active_journeys" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Process each journey
    const processed = [];
    for (const journey of journeys) {
      // Fetch customer data for variables and RFM
      const { data: customer } = await supabase.from("customers_v3").select("*").eq("id", customer_id).single();
      if (!customer) continue;

      // 4. Intelligence Logic (Dynamic Template Choice)
      let message = journey.message_template;
      const val = Number(payload?.cart_value || 0);
      const ship = Number(payload?.shipping_value || 0);
      const inventory = payload?.inventory_status || [];
      
      // A. Urgência Real (Estoque)
      const lowStockItem = inventory.find((i: any) => i.qty > 0 && i.qty < 10);
      if (lowStockItem) {
        message = `Corra, {{nome}}! Restam apenas ${lowStockItem.qty} unidades no estoque e uma delas está no seu carrinho. Garanta antes que acabe: {{link}}`;
      } 
      // B. Barreira de Frete
      else if (val > 0 && ship / val > 0.15) {
        message = `Oi {{nome}}! Vimos que o frete ficou um pouco alto. Como queremos muito você com a gente, liberamos FRETE GRÁTIS para você finalizar agora: {{link}}`;
      }
      // C. RFM Treatment
      else if (customer.rfm_segment === 'campeao') {
        message = `Oi {{nome}}, nosso cliente VIP! Separamos seu carrinho com carinho. Use o cupom VIP10 para um mimo extra: {{link}}`;
      }

      const delay = journey.delay_minutes || 20; 
      const scheduledFor = new Date(Date.now() + delay * 60 * 1000).toISOString();
      
      const finalMessage = message
        .replace("{{nome}}", customer.name || "você")
        .replace("{{link}}", payload?.recovery_url || "");

      // Insert into scheduling table
      const { data: sched, error: schedErr } = await supabase.from("scheduled_messages").insert({
        user_id: store.user_id,
        store_id,
        customer_id: customer.id,
        journey_id: journey.id,
        message_content: finalMessage,
        scheduled_for: scheduledFor,
        status: "pending",
        metadata: { 
          recovery_url: payload?.recovery_url,
          reason: lowStockItem ? 'low_stock' : (ship/val > 0.15 ? 'high_shipping' : 'standard')
        }
      }).select("id").single();

      if (schedErr) {
        console.error("Scheduling error:", schedErr);
      } else {
        processed.push(sched.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, scheduled_messages: processed.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
