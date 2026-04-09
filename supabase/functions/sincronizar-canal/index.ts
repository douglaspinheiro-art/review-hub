import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import { corsHeaders } from "../_shared/edge-utils.ts";

const BodySchema = z.object({ store_id: z.string().uuid() });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "store_id (UUID) is required" }), { status: 400, headers: corsHeaders });
    }
    const { store_id } = parsed.data;

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: connections } = await supabase.from("whatsapp_connections").select("*").eq("store_id", store_id);

    for (const conn of (connections || [])) {
      try {
        const res = await fetch(`${conn.evolution_api_url}/instance/connectionState/${conn.instance_name}`, { headers: { apikey: conn.evolution_api_key } });
        const stateData = await res.json();
        const status = stateData.instance?.state === 'open' ? 'connected' : 'disconnected';
        await supabase.from("whatsapp_connections").update({ status, updated_at: new Date().toISOString() }).eq("id", conn.id);
      } catch (e) { console.error(`Error syncing instance ${conn.instance_name}:`, e); }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
