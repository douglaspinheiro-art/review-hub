/**
 * LTV Boost v4 — Channel Sync Engine
 * Validates WhatsApp/Store connections and updates statuses
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

    const { store_id } = await req.json();

    // 1. Sync WhatsApp Connections
    const { data: connections } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("store_id", store_id);

    for (const conn of (connections || [])) {
      try {
        const res = await fetch(`${conn.evolution_api_url}/instance/connectionState/${conn.instance_name}`, {
          headers: { apikey: conn.evolution_api_key }
        });
        
        const stateData = await res.json();
        const status = stateData.instance?.state === 'open' ? 'connected' : 'disconnected';

        await supabase
          .from("whatsapp_connections")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", conn.id);
      } catch (e) {
        console.error(`Error syncing instance ${conn.instance_name}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
