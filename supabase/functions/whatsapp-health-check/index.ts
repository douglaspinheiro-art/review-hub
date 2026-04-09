/**
 * whatsapp-health-check
 * Periodically validates instance connection status, attempts reconnect,
 * and notifies account owner on disconnections.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/edge-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  if (!serviceRole || authHeader !== `Bearer ${serviceRole}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRole,
  );

  const { data: connections, error } = await supabase
    .from("whatsapp_connections")
    .select("id,user_id,store_id,instance_name,status,evolution_api_url,evolution_api_key")
    .not("evolution_api_url", "is", null)
    .not("evolution_api_key", "is", null)
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let checked = 0;
  let reconnected = 0;
  let disconnected = 0;

  for (const conn of (connections ?? [])) {
    try {
      const stateRes = await fetch(`${conn.evolution_api_url.replace(/\/$/, "")}/instance/connectionState/${conn.instance_name}`, {
        headers: { "Content-Type": "application/json", apikey: conn.evolution_api_key },
      });
      checked += 1;
      if (!stateRes.ok) continue;
      const stateBody = await stateRes.json();
      const state = String(stateBody?.state ?? "close");
      const mapped = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";

      await supabase
        .from("whatsapp_connections")
        .update({ status: mapped })
        .eq("id", conn.id);

      if (mapped === "disconnected") {
        disconnected += 1;
        await fetch(`${conn.evolution_api_url.replace(/\/$/, "")}/instance/connect/${conn.instance_name}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", apikey: conn.evolution_api_key },
        }).then(() => { reconnected += 1; }, () => {});

        const title = `WhatsApp desconectado: ${conn.instance_name}`;
        await (supabase as any).from("notifications").insert({
          user_id: conn.user_id,
          type: "system",
          title,
          body: "Detectamos desconexão da instância. Tentamos reconectar automaticamente.",
          action_url: "/dashboard/whatsapp",
        }).then(() => {}, () => {});
      }
    } catch {
      // skip each failed instance
    }
  }

  return new Response(JSON.stringify({ ok: true, checked, disconnected, reconnect_attempts: reconnected }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
