/**
 * LTV Boost v4 — Attribution: Order Placed Attribution
 * Triggered by a new order to check if it was influenced by a WhatsApp message.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ATTRIBUTION_WINDOW_HOURS = 72;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { order_id, store_id, customer_id, total_value } = await req.json();
  if (!order_id || !store_id || !customer_id) return new Response("Missing data", { status: 400 });

  // 1. Check for messages sent to this customer in the last 72 hours
  const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  
  const { data: sends, error } = await supabase
    .from("message_sends")
    .select("id, campaign_id, created_at")
    .eq("customer_id", customer_id)
    .eq("store_id", store_id)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return new Response(error.message, { status: 500 });

  if (sends && sends.length > 0) {
    const lastSend = sends[0];
    
    // 2. Attribution Found! Update daily analytics
    const today = new Date().toISOString().split("T")[0];
    
    // Increment revenue_influenced in analytics_daily
    const { error: rpcErr } = await supabase.rpc('increment_daily_revenue', {
      p_store_id: store_id,
      p_date: today,
      p_revenue: Number(total_value)
    });

    if (rpcErr) {
       console.error("RPC Error updating analytics:", rpcErr);
       // Manual fallback
       const { data: current } = await supabase
        .from("analytics_daily")
        .select("revenue_influenced")
        .eq("store_id", store_id)
        .eq("date", today)
        .maybeSingle();

       await supabase.from("analytics_daily").upsert({
         store_id,
         date: today,
         revenue_influenced: (Number(current?.revenue_influenced || 0) + Number(total_value))
       }, { onConflict: 'store_id, date' });
    }

    return new Response(JSON.stringify({ ok: true, attributed_to: lastSend.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, attributed: false }));
});
