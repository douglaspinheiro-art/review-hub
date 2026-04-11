/**
 * whatsapp-health-check
 * Valida conexões Meta Cloud (Graph API) e atualiza status na tabela.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/edge-utils.ts";

const GRAPH = "https://graph.facebook.com";

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
    .select("id,user_id,store_id,instance_name,status,provider,meta_phone_number_id,meta_access_token,meta_api_version")
    .eq("provider", "meta_cloud")
    .not("meta_phone_number_id", "is", null)
    .not("meta_access_token", "is", null)
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let checked = 0;
  let disconnected = 0;

  for (const conn of connections ?? []) {
    try {
      const ver = String((conn as { meta_api_version?: string | null }).meta_api_version ?? "v21.0").replace(/^v/, "v");
      const phoneId = (conn as { meta_phone_number_id: string }).meta_phone_number_id;
      const token = (conn as { meta_access_token: string }).meta_access_token;
      const stateRes = await fetch(`${GRAPH}/${ver}/${phoneId}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      checked += 1;
      const mapped = stateRes.ok ? "connected" : "disconnected";
      if (mapped === "disconnected") disconnected += 1;

      await supabase
        .from("whatsapp_connections")
        .update({ status: mapped })
        .eq("id", (conn as { id: string }).id);

      if (mapped === "disconnected") {
        const title = `WhatsApp (Meta): token ou número inválido — ${(conn as { instance_name?: string }).instance_name ?? ""}`;
        await supabase.from("notifications").insert({
          user_id: (conn as { user_id: string }).user_id,
          type: "system",
          title,
          body: "Não foi possível validar a conexão na Graph API. Atualize o token em Dashboard → WhatsApp.",
          action_url: "/dashboard/whatsapp",
        }).then(() => {}, () => {});
      }
    } catch {
      // skip each failed instance
    }
  }

  return new Response(JSON.stringify({ ok: true, checked, disconnected }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
