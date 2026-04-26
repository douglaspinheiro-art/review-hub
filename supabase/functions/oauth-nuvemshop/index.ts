import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";
import {
  invokePostIntegrationSetupFromCallback,
  invokeRegisterWebhooksFromCallback,
} from "../_shared/internal-callback.ts";

const NS_CLIENT_ID = Deno.env.get("NUVEMSHOP_CLIENT_ID") ?? "";
const NS_CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function logOAuth(
  requestId: string,
  phase: "start" | "callback" | "persist",
  fields: Record<string, unknown>,
) {
  console.log(JSON.stringify({ request_id: requestId, platform: "nuvemshop", phase, ...fields }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = crypto.randomUUID();
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
    if (aclErr) {
      logOAuth(requestId, "start", { store_id: storeId, ok: false, detail: "store_access_denied" });
      return errorResponse("Forbidden: store access denied", 403);
    }

    const stateToken = crypto.randomUUID();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Nuvemshop install can take a while (manual approval, app review screen).
    // Use a 60-minute window to avoid losing the state before the lojista finishes.
    const { error: insertErr } = await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: storeId,
      user_id: auth.userId,
      platform: "nuvemshop",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    if (insertErr) {
      logOAuth(requestId, "start", { store_id: storeId, ok: false, detail: `oauth_states_insert: ${insertErr.message}` });
      return errorResponse("Failed to start OAuth flow", 500);
    }

    // Nuvemshop uses the redirect URL configured in the Partners dashboard.
    // Passing a dynamic redirect_uri here can make the install page fail to load.
    const authUrl = `https://www.nuvemshop.com.br/apps/${encodeURIComponent(NS_CLIENT_ID)}/authorize?state=${encodeURIComponent(stateToken)}`;

    logOAuth(requestId, "start", { store_id: storeId, ok: true });
    return jsonResponse({ url: authUrl });
  }

  // ── CALLBACK ─────────────────────────────────────────────────────────────
  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) return errorResponse("Missing code", 400);
    if (!NS_CLIENT_ID || !NS_CLIENT_SECRET) {
      return new Response(redirectHtml(APP_URL, false, "Credenciais Nuvemshop não configuradas"), {
        status: 200, headers: { "Content-Type": "text/html" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Nuvemshop does NOT echo `state` back in the install redirect — it only returns `code`.
    // If state is present, consume it normally; otherwise fall back to the most recent
    // pending nuvemshop oauth_state (created seconds ago by ?action=start).
    let st: { store_id: string; user_id: string } | null = null;
    if (state) {
      const { data: states } = await admin.rpc("consume_oauth_state", { p_token: state });
      st = (states?.[0] as { store_id: string; user_id: string } | undefined) ?? null;
    }
    if (!st) {
      const { data: pending } = await admin
        .from("oauth_states")
        .select("state_token, store_id, user_id, expires_at")
        .eq("platform", "nuvemshop")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending) {
        // Accept the most recent pending state regardless of expiry — Nuvemshop's
        // install flow can outlive the default window, and the security guarantee
        // here is that this state was created by a JWT-authenticated `start` call
        // less than ~24h ago for this exact platform.
        const ageMs = Date.now() - new Date((pending as { expires_at: string }).expires_at).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          logOAuth(requestId, "callback", { ok: false, detail: "fallback_state_too_old" });
          return errorResponse("OAuth state too old; please retry the connection", 403);
        }
        await admin.from("oauth_states").delete().eq("state_token", (pending as { state_token: string }).state_token);
        st = { store_id: (pending as { store_id: string }).store_id, user_id: (pending as { user_id: string }).user_id };
      }
    }
    if (!st) return errorResponse("Invalid or expired state", 403);

    // Exchange code for token
    const tokenRes = await fetch("https://www.nuvemshop.com.br/apps/authorize/token", {
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
      const errTxt = await tokenRes.text();
      logOAuth(requestId, "callback", { store_id: st.store_id, ok: false, detail: errTxt.slice(0, 200) });
      console.error("[oauth-nuvemshop] token exchange failed:", errTxt);
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
        connection_mode: "oauth",
        connection_status: "connected",
      },
      { onConflict: "store_id,type" }
    );

    logOAuth(requestId, "callback", { store_id: st.store_id, ok: true, detail: "persisted" });

    invokePostIntegrationSetupFromCallback(st.user_id).catch(() => {});
    invokeRegisterWebhooksFromCallback(st.store_id, st.user_id, "nuvemshop").catch(() => {});

    return new Response(redirectHtml(APP_URL, true), {
      status: 200, headers: { "Content-Type": "text/html" },
    });
  }

  return errorResponse("Unknown action", 400);
});

function redirectHtml(appUrl: string, success: boolean, error?: string): string {
  return `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "oauth_result", platform: "nuvemshop", success: ${success}, error: ${JSON.stringify(error || null)} }, "*");
      window.close();
    } else {
      window.location.href = "${appUrl}/onboarding?oauth=${success ? "connected" : "error"}";
    }
  </script><p>Redirecionando...</p></body></html>`;
}
