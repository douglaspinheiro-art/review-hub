import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

const NS_CLIENT_ID = Deno.env.get("NUVEMSHOP_CLIENT_ID") ?? "";
const NS_CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── START ────────────────────────────────────────────────────────────────
  if (action === "start") {
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const storeId = url.searchParams.get("store_id");
    if (!storeId) return errorResponse("store_id required", 400);
    if (!NS_CLIENT_ID) return errorResponse("NUVEMSHOP_CLIENT_ID not configured", 500);

    // P0: Verify caller owns/can access the store before issuing OAuth state.
    const authClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { error: aclErr } = await authClient.rpc("assert_store_access", { p_store_id: storeId });
    if (aclErr) return errorResponse("Forbidden: store access denied", 403);

    const stateToken = crypto.randomUUID();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: storeId,
      user_id: auth.userId,
      platform: "nuvemshop",
    });

    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-nuvemshop?action=callback`;
    const authUrl = `https://www.tiendanube.com/apps/${NS_CLIENT_ID}/authorize?state=${stateToken}&redirect_uri=${encodeURIComponent(callbackUrl)}`;

    return jsonResponse({ url: authUrl });
  }

  // ── CALLBACK ─────────────────────────────────────────────────────────────
  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return errorResponse("Missing code or state", 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: states } = await admin.rpc("consume_oauth_state", { p_token: state });
    const st = states?.[0];
    if (!st) return errorResponse("Invalid or expired state", 403);

    // Exchange code for token
    const tokenRes = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: NS_CLIENT_ID,
        client_secret: NS_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[oauth-nuvemshop] token exchange failed:", await tokenRes.text());
      return new Response(redirectHtml(APP_URL, false, "Falha na troca de código"), {
        status: 200, headers: { "Content-Type": "text/html" },
      });
    }

    const tokenData = await tokenRes.json();

    await admin.from("integrations").upsert(
      {
        user_id: st.user_id,
        store_id: st.store_id,
        type: "nuvemshop",
        name: "Nuvemshop",
        config: { user_id: String(tokenData.user_id), access_token: tokenData.access_token },
        is_active: true,
      },
      { onConflict: "store_id,type" }
    );

    admin.functions.invoke("post-integration-setup", {
      body: { store_id: st.store_id, platform: "nuvemshop" },
    }).catch(() => {});

    return new Response(redirectHtml(APP_URL, true), {
      status: 200, headers: { "Content-Type": "text/html" },
    });
  }

  return errorResponse("Unknown action", 400);
});

function redirectHtml(appUrl: string, success: boolean, error?: string): string {
  return `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "oauth_result", platform: "nuvemshop", success: ${success}, error: ${JSON.stringify(error || null)} }, "${appUrl}");
      window.close();
    } else {
      window.location.href = "${appUrl}/onboarding?oauth=${success ? "connected" : "error"}";
    }
  </script><p>Redirecionando...</p></body></html>`;
}
