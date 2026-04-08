import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({ store_id: z.string().uuid() });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "store_id is required (UUID)" }), { status: 400, headers: corsHeaders });
    }
    const { store_id } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: customers, error: custErr } = await supabase.from("customers_v3").select("id").eq("store_id", store_id);
    if (custErr) return new Response(JSON.stringify({ error: custErr.message }), { status: 500, headers: corsHeaders });

    let updatedCount = 0;
    for (const customer of customers ?? []) {
      const { data: orders } = await supabase.from("orders").select("total_amount, created_at").eq("contact_id", customer.id).eq("status", "paid").order("created_at", { ascending: false });
      if (!orders || orders.length === 0) continue;

      const totalSpent = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
      const totalOrders = orders.length;
      const lastOrderDate = new Date(orders[0].created_at);
      const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));

      const rScore = daysSinceLastOrder < 30 ? 5 : daysSinceLastOrder < 90 ? 4 : daysSinceLastOrder < 180 ? 3 : daysSinceLastOrder < 365 ? 2 : 1;
      const fScore = totalOrders >= 10 ? 5 : totalOrders >= 5 ? 4 : totalOrders >= 3 ? 3 : totalOrders >= 2 ? 2 : 1;
      const avgTicket = totalSpent / Math.max(totalOrders, 1);
      const mScore =
        avgTicket >= 400 ? 5 :
        avgTicket >= 200 ? 4 :
        avgTicket >= 100 ? 3 :
        avgTicket >= 50 ? 2 : 1;

      // English keys — aligned with newsletter, dispatch-campaign, dashboard RFM
      let segment = "loyal";
      if (rScore >= 4 && fScore >= 4) segment = "champions";
      else if (fScore >= 4) segment = "loyal";
      else if (rScore >= 4 && fScore === 1) segment = "new";
      else if (rScore === 1) segment = "lost";
      else if (rScore <= 2) segment = "at_risk";
      else segment = "loyal";

      await supabase.from("customers_v3").update({
        rfm_recency: rScore,
        rfm_frequency: fScore,
        rfm_monetary: mScore,
        rfm_segment: segment,
        last_purchase_at: lastOrderDate.toISOString(),
      }).eq("id", customer.id);

      updatedCount++;
    }

    return new Response(JSON.stringify({ ok: true, updated: updatedCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
