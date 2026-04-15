/**
 * meta-wa-oauth
 *
 * Receives the OAuth code from Meta Embedded Signup,
 * exchanges it for a long-lived token, fetches WABA + phone number IDs,
 * creates/updates a whatsapp_connections row, and subscribes the webhook.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- Auth: require valid Supabase JWT ---
    const authHeader = req.headers.get("authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { code, store_id, instance_name } = body as {
      code: string;
      store_id: string;
      instance_name?: string;
    };

    if (!code || !store_id) {
      return new Response(JSON.stringify({ error: "code and store_id are required" }), {
        status: 400,
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

    // Step 1: Exchange code for short-lived token
    const tokenUrl = `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return new Response(JSON.stringify({ error: tokenData?.error?.message ?? "Token exchange failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Exchange for long-lived token
    const llUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`;
    const llRes = await fetch(llUrl);
    const llData = await llRes.json();
    const accessToken = llData.access_token ?? tokenData.access_token;
    // Meta returns expires_in in seconds; ~60 days for long-lived tokens
    const expiresIn = llData.expires_in ?? tokenData.expires_in ?? 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Step 3: Get shared WABAs (Embedded Signup grants access to the user's WABA)
    const debugRes = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`);
    const debugData = await debugRes.json();
    const granularScopes = debugData?.data?.granular_scopes ?? [];
    const wabaScope = granularScopes.find((s: { scope: string }) => s.scope === "whatsapp_business_messaging");
    const wabaIds: string[] = wabaScope?.target_ids ?? [];

    let metaPhoneNumberId = "";
    let metaWabaId = wabaIds[0] ?? "";
    let metaBusinessId = "";
    let displayPhoneNumber = "";

    // Step 4: For each WABA, get phone numbers
    if (metaWabaId) {
      const wabaInfoRes = await fetch(`${GRAPH}/${metaWabaId}?fields=id,name,owner_business_info`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const wabaInfo = await wabaInfoRes.json();
      metaBusinessId = wabaInfo?.owner_business_info?.id ?? "";

      const phonesRes = await fetch(`${GRAPH}/${metaWabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const phonesData = await phonesRes.json();
      const phones = phonesData?.data ?? [];
      if (phones.length > 0) {
        metaPhoneNumberId = phones[0].id;
        displayPhoneNumber = phones[0].display_phone_number ?? "";
      }

      // Step 5: Subscribe the app to the WABA (auto-register webhook)
      const webhookUrl = `${supabaseUrl}/functions/v1/meta-whatsapp-webhook`;
      try {
        await fetch(`${GRAPH}/${metaWabaId}/subscribed_apps`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ override_callback_url: webhookUrl }),
        });
      } catch {
        // Non-critical: webhook can be registered manually
      }
    }

    // Step 6: Save to whatsapp_connections using service role
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const adminClient = createClient(supabaseUrl, serviceRole);

    const connName = (instance_name?.trim()) || `Meta ${displayPhoneNumber || metaWabaId}`;

    const row = {
      user_id: user.id,
      store_id,
      instance_name: connName,
      status: metaPhoneNumberId ? "connected" : "disconnected",
      provider: "meta_cloud",
      meta_phone_number_id: metaPhoneNumberId || null,
      meta_waba_id: metaWabaId || null,
      meta_access_token: accessToken,
      meta_token_expires_at: expiresAt,
      meta_business_id: metaBusinessId || null,
      meta_api_version: "v21.0",
      phone_number: displayPhoneNumber || null,
      connected_at: metaPhoneNumberId ? new Date().toISOString() : null,
      evolution_api_url: null,
      evolution_api_key: null,
    };

    const { data: inserted, error: insertErr } = await adminClient
      .from("whatsapp_connections")
      .insert(row)
      .select("id, instance_name, status, meta_phone_number_id")
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        connection: inserted,
        display_phone_number: displayPhoneNumber,
        waba_id: metaWabaId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
