import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appId = Deno.env.get("META_APP_ID")?.trim() ?? "";
  if (!appId) {
    return new Response(JSON.stringify({ error: "META_APP_ID not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Optional: Embedded Signup config_id (created in Meta App Dashboard → WhatsApp → Configuration)
  const configId = Deno.env.get("META_EMBEDDED_SIGNUP_CONFIG_ID")?.trim() ?? "";
  // Graph API version (default v21.0)
  const graphVersion = Deno.env.get("META_GRAPH_VERSION")?.trim() || "v21.0";

  return new Response(
    JSON.stringify({
      app_id: appId,
      config_id: configId || null,
      graph_version: graphVersion,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
