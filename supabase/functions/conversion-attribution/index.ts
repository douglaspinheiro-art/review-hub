import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  order_id: z.string().min(1),
  store_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  total_value: z.number().min(0).optional(),
});

const ATTRIBUTION_WINDOW_HOURS = 72;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { order_id, store_id, customer_id, total_value } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const windowStart = new Date(Date.now() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: sends, error } = await supabase
      .from("message_sends").select("id, campaign_id, created_at")
      .eq("contact_id", customer_id).eq("store_id", store_id)
      .gte("created_at", windowStart).order("created_at", { ascending: false }).limit(1);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

    if (sends && sends.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.rpc('increment_daily_revenue', { p_date: today, p_amount: Number(total_value ?? 0) }).then(
        () => {},
        async () => {
          const { data: current } = await supabase.from("analytics_daily").select("revenue_influenced").eq("store_id", store_id).eq("date", today).maybeSingle();
          await supabase.from("analytics_daily").upsert({ store_id, date: today, revenue_influenced: (Number(current?.revenue_influenced || 0) + Number(total_value ?? 0)) }, { onConflict: 'store_id, date' });
        }
      );
      return new Response(JSON.stringify({ ok: true, attributed_to: sends[0].id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, attributed: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
