import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── START: Generate WooCommerce auth URL ─────────────────────────────────
  if (action === "start") {
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const storeId = url.searchParams.get("store_id");
    const siteUrl = url.searchParams.get("site_url");
    if (!storeId || !siteUrl) return errorResponse("store_id and site_url required", 400);

    const stateToken = crypto.randomUUID();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: storeId,
      user_id: auth.userId,
      platform: "woocommerce",
      extra_data: { site_url: siteUrl },
    });

    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-woocommerce?action=callback`;
    const cleanSiteUrl = siteUrl.replace(/\/$/, "");
    // WooCommerce REST API auto-key generation endpoint
    const wcAuthUrl = `${cleanSiteUrl}/wc-auth/v1/authorize?app_name=LTV+Boost&scope=read_write&user_id=${stateToken}&return_url=${encodeURIComponent(APP_URL + "/onboarding?oauth=connected")}&callback_url=${encodeURIComponent(callbackUrl)}`;

    return jsonResponse({ url: wcAuthUrl });
  }

  // ── CALLBACK: WooCommerce posts consumer_key/consumer_secret via POST ───
  if (action === "callback" && req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    const userId = body.user_id as string; // This is our state_token
    const consumerKey = body.consumer_key as string;
    const consumerSecret = body.consumer_secret as string;
    if (!userId || !consumerKey || !consumerSecret) return errorResponse("Missing fields", 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: states } = await admin.rpc("consume_oauth_state", { p_token: userId });
    const st = states?.[0];
    if (!st) return errorResponse("Invalid or expired state", 403);

    const siteUrl = (st.extra_data as { site_url?: string })?.site_url || "";

    await admin.from("integrations").upsert(
      {
        user_id: st.user_id,
        store_id: st.store_id,
        type: "woocommerce",
        name: "WooCommerce",
        config: { site_url: siteUrl, consumer_key: consumerKey, consumer_secret: consumerSecret },
        is_active: true,
      },
      { onConflict: "store_id,type" }
    );

    admin.functions.invoke("post-integration-setup", {
      body: { store_id: st.store_id, platform: "woocommerce" },
    }).catch(() => {});

    return jsonResponse({ success: true });
  }

  return errorResponse("Unknown action", 400);
});
