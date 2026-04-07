import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  customer_id: z.string().uuid(),
  store_id: z.string().uuid(),
  channel: z.string().min(1).max(50),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: corsHeaders });
    }
    const { customer_id, store_id, channel } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: config } = await supabase.from("settings_v3").select("cap_msgs_whatsapp_week").eq("store_id", store_id).maybeSingle();
    const cap = (config as any)?.cap_msgs_whatsapp_week || 2;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count, error } = await supabase
      .from("communications_sent").select("id", { count: "exact" })
      .eq("store_id", store_id).eq("cliente_id", customer_id)
      .eq("canal", channel).gte("enviado_em", sevenDaysAgo.toISOString());

    if (error) throw error;
    const allowed = (count || 0) < cap;

    return new Response(JSON.stringify({ allowed, current_count: count, cap }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
