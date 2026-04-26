import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";
import {
  invokePostIntegrationSetupFromCallback,
  invokeRegisterWebhooksFromCallback,
} from "../_shared/internal-callback.ts";
import { verifyShopifyQueryHmac, isValidShopDomain } from "../_shared/shopify-hmac.ts";

const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCOPES = "read_orders,read_customers,read_products,read_checkouts";

function logOAuth(
  requestId: string,
  phase: "start" | "callback" | "persist",
  fields: Record<string, unknown>,
) {
  console.log(JSON.stringify({ request_id: requestId, platform: "shopify", phase, ...fields }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  // Support both query-style (?action=callback) and path-style (/callback) callbacks.
  // Shopify Partners requires the redirect_uri host to match the App URL host; using a
  // path segment keeps the URL cleaner and easier to whitelist.
  const isPathCallback = url.pathname.endsWith("/callback");

  // ── INSTALL FLOW: Shopify hits the App URL directly with ?shop=&hmac=&host= ──
  // No JWT, no action — must validate HMAC and redirect to /admin/oauth/authorize
  // immediately to pass Shopify automated checks ("authenticates immediately on install").
  const shopParam = url.searchParams.get("shop");
  const hmacParam = url.searchParams.get("hmac");
  if (!action && !isPathCallback && shopParam && hmacParam && req.method === "GET") {
    if (!isValidShopDomain(shopParam)) return errorResponse("Invalid shop domain", 400);
    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
      return errorResponse("Shopify app not configured", 500);
    }
    const hmacOk = await verifyShopifyQueryHmac(url, SHOPIFY_CLIENT_SECRET);
    if (!hmacOk) {
      logOAuth(requestId, "start", { ok: false, detail: "install_hmac_invalid", shop: shopParam });
      return errorResponse("Invalid HMAC", 401);
    }
    const stateToken = crypto.randomUUID();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: null,
      user_id: null,
      platform: "shopify",
      extra_data: { shop: shopParam, install_flow: true, host: url.searchParams.get("host") },
    });
    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-shopify/callback`;
    const authUrl = `https://${shopParam}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${stateToken}`;
    logOAuth(requestId, "start", { ok: true, install_flow: true, shop: shopParam });
    return new Response(null, { status: 302, headers: { Location: authUrl } });
  }

  // ── START: Generate Shopify OAuth URL ────────────────────────────────────
  if (action === "start") {
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const storeId = url.searchParams.get("store_id");
    const shopDomain = url.searchParams.get("shop"); // e.g. minhaloja.myshopify.com
    if (!storeId || !shopDomain) return errorResponse("store_id and shop are required", 400);
    if (!SHOPIFY_CLIENT_ID) return errorResponse("SHOPIFY_CLIENT_ID not configured", 500);

    // P0: Verify caller owns/can access the store before issuing OAuth state.
    // Prevents authenticated attacker from initiating an OAuth flow bound to another tenant's store_id.
    const authClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { error: aclErr } = await authClient.rpc("assert_store_access", { p_store_id: storeId });
    if (aclErr) {
      logOAuth(requestId, "start", { store_id: storeId, ok: false, detail: "store_access_denied" });
      return errorResponse("Forbidden: store access denied", 403);
    }

    const stateToken = crypto.randomUUID();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: storeId,
      user_id: auth.userId,
      platform: "shopify",
      extra_data: { shop: shopDomain },
    });

    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-shopify/callback`;
    console.log(JSON.stringify({ request_id: requestId, platform: "shopify", phase: "start", redirect_uri: callbackUrl }));
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${stateToken}`;

    logOAuth(requestId, "start", { store_id: storeId, ok: true });
    return jsonResponse({ url: authUrl });
  }

  // ── CALLBACK: Exchange code for permanent token ──────────────────────────
  if (action === "callback" || isPathCallback) {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const shop = url.searchParams.get("shop");
    if (!code || !state || !shop) return errorResponse("Missing code, state, or shop", 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Consume state (atomic, CSRF-safe)
    const { data: states } = await admin.rpc("consume_oauth_state", { p_token: state });
    const st = states?.[0];
    if (!st) return errorResponse("Invalid or expired state", 403);

    // Exchange code for access_token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[oauth-shopify] token exchange failed:", errText);
      return new Response(redirectHtml(APP_URL, false, "Falha ao trocar code por token"), {
        status: 200, headers: { "Content-Type": "text/html" },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Save integration
    await admin.from("integrations").upsert(
      {
        user_id: st.user_id,
        store_id: st.store_id,
        type: "shopify",
        name: "Shopify",
        config: { shop_url: shop, access_token: accessToken },
        is_active: true,
        connection_mode: "oauth",
        connection_status: "connected",
      },
      { onConflict: "store_id,type" }
    );

    logOAuth(requestId, "callback", { store_id: st.store_id, ok: true, detail: "token_exchanged" });

    invokePostIntegrationSetupFromCallback(st.user_id).catch(() => {});
    invokeRegisterWebhooksFromCallback(st.store_id, st.user_id, "shopify").catch(() => {});

    // Install-flow callback: redirect into the embedded Shopify Admin app surface.
    // Required by Shopify automated check "redirects to app UI after authentication".
    const isInstallFlow = (st.extra_data as { install_flow?: boolean } | null)?.install_flow === true;
    if (isInstallFlow) {
      const adminAppUrl = `https://${shop}/admin/apps/${SHOPIFY_CLIENT_ID}`;
      return new Response(null, { status: 302, headers: { Location: adminAppUrl } });
    }

    return new Response(redirectHtml(APP_URL, true), {
      status: 200, headers: { "Content-Type": "text/html" },
    });
  }

  return errorResponse("Unknown action", 400);
});

function redirectHtml(appUrl: string, success: boolean, error?: string): string {
  const msg = success ? "connected" : `error:${error || "unknown"}`;
  return `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "oauth_result", platform: "shopify", success: ${success}, error: ${JSON.stringify(error || null)} }, "${appUrl}");
      window.close();
    } else {
      window.location.href = "${appUrl}/onboarding?oauth=${msg}";
    }
  </script><p>Redirecionando...</p></body></html>`;
}
