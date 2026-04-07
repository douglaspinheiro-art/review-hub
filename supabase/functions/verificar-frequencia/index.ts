/**
 * LTV Boost v4 — Frequency Capping (Anti-Spam)
 * Checks if a customer should receive a message based on store policy
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

    const { customer_id, store_id, channel } = await req.json();

    if (!customer_id || !store_id || !channel) throw new Error("Missing parameters");

    // 1. Get store anti-spam config (default to 2 per week)
    const { data: config } = await supabase.from("settings_v3").select("cap_msgs_whatsapp_week").eq("store_id", store_id).maybeSingle();
    const cap = config?.cap_msgs_whatsapp_week || 2;

    // 2. Count messages sent in the last 7 days to this customer
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count, error } = await supabase
      .from("communications_sent")
      .select("id", { count: "exact" })
      .eq("store_id", store_id)
      .eq("customer_id", customer_id)
      .eq("channel", channel)
      .gte("sent_at", sevenDaysAgo.toISOString());

    if (error) throw error;

    const allowed = (count || 0) < cap;

    return new Response(JSON.stringify({ allowed, current_count: count, cap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
