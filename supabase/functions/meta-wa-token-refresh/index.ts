/**
 * meta-wa-token-refresh (cron)
 *
 * Scans whatsapp_connections for tokens expiring within 7 days
 * and refreshes them via the Graph API long-lived token exchange.
 *
 * Auth: CRON_SECRET in Authorization header.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth via CRON_SECRET
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appId = Deno.env.get("META_APP_ID") ?? "";
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  if (!appId || !appSecret) {
    return new Response(JSON.stringify({ error: "META_APP_ID / META_APP_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRole);

  // Find connections expiring within 7 days
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connections, error } = await supabase
    .from("whatsapp_connections")
    .select("id, user_id, store_id, instance_name, meta_access_token, meta_token_expires_at")
    .eq("provider", "meta_cloud")
    .not("meta_access_token", "is", null)
    .not("meta_token_expires_at", "is", null)
    .lt("meta_token_expires_at", sevenDaysFromNow)
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let refreshed = 0;
  let failed = 0;

  for (const conn of connections ?? []) {
    try {
      const currentToken = (conn as { meta_access_token: string }).meta_access_token;
      const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.access_token) {
        failed += 1;
        // Notify user
        await supabase.from("notifications").insert({
          user_id: (conn as { user_id: string }).user_id,
          type: "system",
          title: `WhatsApp: token expirado — ${(conn as { instance_name: string }).instance_name}`,
          body: "Não foi possível renovar o token automaticamente. Reconecte o WhatsApp pelo dashboard.",
          action_url: "/dashboard/whatsapp",
        }).then(() => {}, () => {});
        continue;
      }

      const expiresIn = data.expires_in ?? 5184000;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await supabase
        .from("whatsapp_connections")
        .update({
          meta_access_token: data.access_token,
          meta_token_expires_at: expiresAt,
        })
        .eq("id", (conn as { id: string }).id);

      refreshed += 1;
    } catch {
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, total: (connections ?? []).length, refreshed, failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
