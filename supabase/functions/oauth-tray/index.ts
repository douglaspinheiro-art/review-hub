import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";
import {
  invokePostIntegrationSetupFromCallback,
  invokeRegisterWebhooksFromCallback,
} from "../_shared/internal-callback.ts";

const TRAY_CONSUMER_KEY = Deno.env.get("TRAY_CONSUMER_KEY") ?? "";
const TRAY_CONSUMER_SECRET = Deno.env.get("TRAY_CONSUMER_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function logOAuth(
  requestId: string,
  phase: "start" | "callback" | "persist",
  fields: Record<string, unknown>,
) {
  console.log(JSON.stringify({ request_id: requestId, platform: "tray", phase, ...fields }));
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
    const apiAddress = url.searchParams.get("api_address"); // ex: minha-loja.commercesuite.com.br
    const returnTo = url.searchParams.get("return_to") ?? "onboarding";

    if (!storeId || !apiAddress) return errorResponse("store_id and api_address required", 400);
    if (!TRAY_CONSUMER_KEY) return errorResponse("TRAY_CONSUMER_KEY not configured", 500);

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
    await admin.from("oauth_states").insert({
      state_token: stateToken,
      store_id: storeId,
      user_id: auth.userId,
      platform: "tray",
      extra_data: { api_address: apiAddress, return_to: returnTo },
    });

    const cleanApi = apiAddress.replace(/\/$/, "");
    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-tray?action=callback`;
    // Tray OAuth: redireciona para autorização do lojista
    const authUrl =
      `https://${cleanApi}/auth.php?response_type=code` +
      `&consumer_key=${encodeURIComponent(TRAY_CONSUMER_KEY)}` +
      `&callback=${encodeURIComponent(`${callbackUrl}&state=${stateToken}`)}`;

    logOAuth(requestId, "start", { store_id: storeId, ok: true, return_to: returnTo });
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

    const extra = (st.extra_data ?? {}) as { api_address?: string; return_to?: string };
    const apiAddress = (extra.api_address ?? "").replace(/\/$/, "");
    if (!apiAddress) {
      return new Response(redirectHtml(APP_URL, false, "api_address ausente no state"), {
        status: 200, headers: { "Content-Type": "text/html" },
      });
    }

    // Exchange code for access_token + refresh_token
    const tokenRes = await fetch(`https://${apiAddress}/auth.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        consumer_key: TRAY_CONSUMER_KEY,
        consumer_secret: TRAY_CONSUMER_SECRET,
        code,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text();
      logOAuth(requestId, "callback", { store_id: st.store_id, ok: false, detail: errTxt.slice(0, 200) });
      return new Response(redirectHtml(APP_URL, false, "Falha na troca de código"), {
        status: 200, headers: { "Content-Type": "text/html" },
      });
    }

    const tokenData = await tokenRes.json();

    await admin.from("integrations").upsert(
      {
        user_id: st.user_id,
        store_id: st.store_id,
        type: "tray",
        name: "Tray",
        config: {
          api_address: apiAddress,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          store_id_tray: tokenData.store_id ? String(tokenData.store_id) : undefined,
          expires_at: tokenData.date_expiration_access_token ?? null,
          refresh_expires_at: tokenData.date_expiration_refresh_token ?? null,
        },
        is_active: true,
        connection_mode: "oauth",
        connection_status: "connected",
      },
      { onConflict: "store_id,type" },
    );

    logOAuth(requestId, "callback", { store_id: st.store_id, ok: true, detail: "persisted" });

    invokePostIntegrationSetupFromCallback(st.user_id).catch(() => {});
    invokeRegisterWebhooksFromCallback(st.store_id, st.user_id, "tray").catch(() => {});

    return new Response(redirectHtml(APP_URL, true), {
      status: 200, headers: { "Content-Type": "text/html" },
    });
  }

  return errorResponse("Unknown action", 400);
});

function redirectHtml(appUrl: string, success: boolean, error?: string): string {
  return `<!DOCTYPE html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "oauth_result", platform: "tray", success: ${success}, error: ${JSON.stringify(error || null)} }, "${appUrl}");
      window.close();
    } else {
      window.location.href = "${appUrl}/onboarding?oauth=${success ? "connected" : "error"}";
    }
  </script><p>Redirecionando...</p></body></html>`;
}
