/**
 * LTV Boost v4 — Intelligence: Calculate RFM
 * Recalculates RFM segments for customers based on their order history.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { store_id } = await req.json();
  if (!store_id) return new Response(JSON.stringify({ error: "store_id is required" }), { status: 400 });

  // 1. Get all customers for this store
  const { data: customers, error: custErr } = await supabase
    .from("customers_v3")
    .select("id")
    .eq("store_id", store_id);

  if (custErr) return new Response(JSON.stringify({ error: custErr.message }), { status: 500 });

  let updatedCount = 0;

  for (const customer of customers) {
    // 2. Fetch order stats for this customer
    const { data: orders, error: orderErr } = await supabase
      .from("orders")
      .select("total_value, created_at")
      .eq("customer_id", customer.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false });

    if (orderErr || !orders || orders.length === 0) continue;

    const totalSpent = orders.reduce((sum, o) => sum + Number(o.total_value), 0);
    const totalOrders = orders.length;
    const lastOrderDate = new Date(orders[0].created_at);
    const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

    // 3. Scoring Logic (Simplified RFM 1-5)
    // Recency: Higher score for lower days
    const rScore = daysSinceLastOrder < 30 ? 5 : daysSinceLastOrder < 90 ? 4 : daysSinceLastOrder < 180 ? 3 : daysSinceLastOrder < 365 ? 2 : 1;
    // Frequency: Higher score for more orders
    const fScore = totalOrders >= 10 ? 5 : totalOrders >= 5 ? 4 : totalOrders >= 3 ? 3 : totalOrders >= 2 ? 2 : 1;
    // Monetary: Higher score for more spent
    const mScore = totalSpent > 1000 ? 5 : totalSpent > 500 ? 4 : totalSpent > 200 ? 3 : totalSpent > 50 ? 2 : 1;

    // 4. Segment Assignment
    let segment = "novo";
    if (rScore >= 4 && fScore >= 4) segment = "campeao";
    else if (fScore >= 4) segment = "fiel";
    else if (rScore >= 4 && fScore === 1) segment = "novo";
    else if (rScore <= 2) segment = "em_risco";
    else if (rScore === 1) segment = "perdido";
    else segment = "promissor";

    // 5. Update Customer
    await supabase.from("customers_v3").update({
      rfm_recency: rScore,
      rfm_frequency: fScore,
      rfm_monetary: totalSpent,
      rfm_segment: segment,
      last_purchase_at: lastOrderDate.toISOString()
    }).eq("id", customer.id);

    updatedCount++;
  }

  return new Response(JSON.stringify({ ok: true, updated: updatedCount }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
