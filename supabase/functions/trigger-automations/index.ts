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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    for (const cart of (pendingCarts || [])) {
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
          payload: { recovery_url: cart.recovery_url, value: cart.value }
        })
      });

      if (flowRes.ok) {
        // 3. Mark cart as 'processed'
        await supabase
          .from("abandoned_carts")
          .update({ status: "processed", processed_at: new Date().toISOString() })
          .eq("id", cart.id);
        
        results.push({ cart_id: cart.id, status: "success" });
      } else {
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
