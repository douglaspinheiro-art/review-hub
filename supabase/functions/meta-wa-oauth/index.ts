/**
 * meta-wa-oauth
 *
 * Receives the OAuth code from Meta Embedded Signup,
 * exchanges it for a long-lived token, fetches WABA + phone number IDs,
 * upserts a whatsapp_connections row (idempotent on store_id + phone_number_id),
 * subscribes the webhook, and writes an audit log entry.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION")?.trim() || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- Auth ---
    const authHeader = req.headers.get("authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const { code, store_id, instance_name } = body as {
      code?: string;
      store_id?: string;
      instance_name?: string;
    };
    if (!code || !store_id) {
      return jsonResponse({ error: "code and store_id are required" }, 400);
    }

    // --- Secrets ---
    const appId = Deno.env.get("META_APP_ID") ?? "";
    const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!appId || !appSecret) {
      return jsonResponse({ error: "META_APP_ID / META_APP_SECRET not configured" }, 500);
    }
    if (!serviceRole) {
      return jsonResponse({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
    }

    // --- Authorize: user must own or be team-member of the store ---
    const adminClient = createClient(supabaseUrl, serviceRole);
    const { data: storeRow, error: storeErr } = await adminClient
      .from("stores")
      .select("id, user_id")
      .eq("id", store_id)
      .maybeSingle();
    if (storeErr || !storeRow) return jsonResponse({ error: "Store not found" }, 404);

    if (storeRow.user_id !== user.id) {
      const { data: tm } = await adminClient
        .from("team_members")
        .select("id")
        .eq("account_owner_id", storeRow.user_id)
        .eq("invited_user_id", user.id)
        .eq("status", "active")
        .in("role", ["admin", "operator"])
        .maybeSingle();
      if (!tm) return jsonResponse({ error: "Forbidden: store access denied" }, 403);
    }

    // --- Step 1: Exchange code for short-lived token ---
    const tokenUrl = `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return jsonResponse(
        { error: tokenData?.error?.message ?? "Token exchange failed", details: tokenData },
        400,
      );
    }

    // --- Step 2: Long-lived token ---
    const llUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`;
    const llRes = await fetch(llUrl);
    const llData = await llRes.json();
    const accessToken: string = llData.access_token ?? tokenData.access_token;
    const expiresIn: number = llData.expires_in ?? tokenData.expires_in ?? 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // --- Step 3: Discover WABA via debug_token ---
    const debugRes = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
    );
    const debugData = await debugRes.json();
    const granularScopes = debugData?.data?.granular_scopes ?? [];
    const wabaScope = granularScopes.find(
      (s: { scope: string }) => s.scope === "whatsapp_business_messaging",
    );
    const wabaIds: string[] = wabaScope?.target_ids ?? [];

    let metaPhoneNumberId = "";
    let metaWabaId = wabaIds[0] ?? "";
    let metaBusinessId = "";
    let displayPhoneNumber = "";
    let webhookSubscribed = false;

    // --- Step 4: Get phone number from WABA ---
    if (metaWabaId) {
      const wabaInfoRes = await fetch(
        `${GRAPH}/${metaWabaId}?fields=id,name,owner_business_info`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const wabaInfo = await wabaInfoRes.json();
      metaBusinessId = wabaInfo?.owner_business_info?.id ?? "";

      const phonesRes = await fetch(
        `${GRAPH}/${metaWabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const phonesData = await phonesRes.json();
      const phones = phonesData?.data ?? [];
      if (phones.length > 0) {
        metaPhoneNumberId = phones[0].id;
        displayPhoneNumber = phones[0].display_phone_number ?? "";
      }

      // --- Step 5: Subscribe app to WABA (auto-register webhook) ---
      const webhookUrl = `${supabaseUrl}/functions/v1/meta-whatsapp-webhook`;
      try {
        const subRes = await fetch(`${GRAPH}/${metaWabaId}/subscribed_apps`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ override_callback_url: webhookUrl }),
        });
        webhookSubscribed = subRes.ok;
      } catch {
        webhookSubscribed = false;
      }
    }

    // --- Step 6: Upsert connection (idempotent on store_id + meta_phone_number_id) ---
    const connName = (instance_name?.trim()) || `Meta ${displayPhoneNumber || metaWabaId}`;
    const status = metaPhoneNumberId ? "connected" : "disconnected";
    const nowIso = new Date().toISOString();

    const baseRow = {
      user_id: user.id,
      store_id,
      instance_name: connName,
      status,
      provider: "meta_cloud",
      meta_phone_number_id: metaPhoneNumberId || null,
      meta_waba_id: metaWabaId || null,
      meta_access_token: accessToken,
      meta_token_expires_at: expiresAt,
      meta_business_id: metaBusinessId || null,
      meta_api_version: GRAPH_VERSION,
      phone_number: displayPhoneNumber || null,
      connected_at: metaPhoneNumberId ? nowIso : null,
    };

    let inserted: { id: string; instance_name: string; status: string; meta_phone_number_id: string | null } | null = null;
    let upsertErr: { message: string } | null = null;

    if (metaPhoneNumberId) {
      const result = await adminClient
        .from("whatsapp_connections")
        .upsert(baseRow, { onConflict: "store_id,meta_phone_number_id" })
        .select("id, instance_name, status, meta_phone_number_id")
        .single();
      inserted = result.data as typeof inserted;
      upsertErr = result.error;
    } else {
      // Sem phone_number_id não existe chave única — apenas insere.
      const result = await adminClient
        .from("whatsapp_connections")
        .insert(baseRow)
        .select("id, instance_name, status, meta_phone_number_id")
        .single();
      inserted = result.data as typeof inserted;
      upsertErr = result.error;
    }

    if (upsertErr || !inserted) {
      return jsonResponse({ error: upsertErr?.message ?? "Failed to persist connection" }, 500);
    }

    // --- Step 7: Audit log ---
    try {
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        store_id,
        action: "whatsapp_embedded_signup",
        resource: `whatsapp_connections:${inserted.id}`,
        result: status,
        metadata: {
          waba_id: metaWabaId,
          phone_number_id: metaPhoneNumberId,
          display_phone_number: displayPhoneNumber,
          webhook_subscribed: webhookSubscribed,
          graph_version: GRAPH_VERSION,
        },
      });
    } catch {
      // Audit failure must not break the flow.
    }

    return jsonResponse({
      ok: true,
      connection: inserted,
      display_phone_number: displayPhoneNumber,
      waba_id: metaWabaId,
      webhook_subscribed: webhookSubscribed,
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
