import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCOPES = "read_orders,read_customers,read_products,read_checkouts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── START: Generate Shopify OAuth URL ────────────────────────────────────
  if (action === "start") {
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const storeId = url.searchParams.get("store_id");
    const shopDomain = url.searchParams.get("shop"); // e.g. minhaloja.myshopify.com
    if (!storeId || !shopDomain) return errorResponse("store_id and shop are required", 400);
    if (!SHOPIFY_CLIENT_ID) return errorResponse("SHOPIFY_CLIENT_ID not configured", 500);

    const stateToken = crypto.randomUUID();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: storeId,
      user_id: auth.userId,
      platform: "shopify",
      extra_data: { shop: shopDomain },
    });

    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-shopify?action=callback`;
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${stateToken}`;

    return jsonResponse({ url: authUrl });
  }

  // ── CALLBACK: Exchange code for permanent token ──────────────────────────
  if (action === "callback") {
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
      },
      { onConflict: "store_id,type" }
    );

    // Trigger post-integration-setup (best-effort)
    admin.functions.invoke("post-integration-setup", {
      body: { store_id: st.store_id, platform: "shopify" },
    }).catch(() => {});

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
