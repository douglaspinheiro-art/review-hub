/**
 * Google OAuth callback for GA4 connection.
 *
 * Two modes:
 *   GET  ?action=start&store_id=...   → returns { url } to start the OAuth dance
 *   GET  ?code=...&state=...          → Google redirects here; exchanges code → tokens, persists in stores, returns HTML that posts a message to the opener and closes
 *
 * P0 hardening: state is now a one-time, server-persisted token in `oauth_states`
 * (CSRF/tenant-confusion proof). Replaces previous `userId:storeId:uuid` string.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://ltvboost.com.br",
  "https://www.ltvboost.com.br",
  "https://ltvboost.lovable.app",
  "https://review-hub-dusky.vercel.app",
];

function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") ?? "";
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGIN") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);

  let allowOrigin = allowedOrigins.has(origin) ? origin : "*";
  try {
    const hostname = new URL(origin).hostname;
    if (hostname.endsWith(".lovable.app") || hostname.endsWith(".lovableproject.com") || hostname === "localhost") {
      allowOrigin = origin;
    }
  } catch {
    // Non-browser requests do not send Origin; wildcard is safe for those.
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function callbackUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return `${supabaseUrl}/functions/v1/google-oauth-callback`;
}

function htmlResponse(payload: Record<string, unknown>, req?: Request): Response {
  const json = JSON.stringify(payload);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GA4 Connected</title></head>
<body style="font-family:system-ui;background:#0A0A0F;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center">
    <p style="font-size:18px;margin:0 0 8px">${payload.success ? "✓ Conectado!" : "Falha na conexão"}</p>
    <p style="opacity:.6;font-size:13px;margin:0">Esta janela vai fechar automaticamente.</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'ga4_oauth_result', ...${json} }, '*');
      }
    } catch (e) {}
    setTimeout(() => window.close(), 800);
  </script>
</body></html>`;
  return new Response(html, { headers: { ...getCorsHeaders(req), "Content-Type": "text/html; charset=utf-8" } });
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "GOOGLE_CLIENT_ID/SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Mode 1: start the OAuth flow ──
  if (action === "start") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;
    const storeId = url.searchParams.get("store_id");
    if (!storeId) {
      return new Response(JSON.stringify({ error: "store_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller actually owns/can-access the store before issuing state.
    const { error: aclErr } = await supabase.rpc("assert_store_access", { p_store_id: storeId });
    if (aclErr) {
      return new Response(JSON.stringify({ error: "Forbidden: store access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // P0: persist one-time state token in oauth_states (10-min expiry).
    const stateToken = crypto.randomUUID();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { error: insErr } = await admin.from("oauth_states").insert({
      state_token: stateToken,
      user_id: userId,
      store_id: storeId,
      platform: "google",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (insErr) {
      console.error("[google-oauth-callback] oauth_states insert failed:", insErr.message);
      return new Response(JSON.stringify({ error: "Failed to start OAuth flow" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state: stateToken,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Mode 2: Google redirect ──
  if (code && stateParam) {
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      // P0: consume state atomically (DELETE + RETURNING, one-time, expiry-checked).
      const { data: states, error: stateErr } = await admin.rpc("consume_oauth_state", { p_token: stateParam });
      if (stateErr) throw new Error(`State validation failed: ${stateErr.message}`);
      const st = (states as Array<{ user_id: string; store_id: string; platform: string }> | null)?.[0];
      if (!st || st.platform !== "google") throw new Error("Invalid or expired state");

      const userId = st.user_id;
      const storeId = st.store_id;

      // Exchange code → tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl(),
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${(await tokenRes.text()).slice(0, 200)}`);
      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      // Fetch user email (optional)
      let email: string | null = null;
      try {
        const profRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (profRes.ok) {
          const prof = await profRes.json() as { email?: string };
          email = prof.email ?? null;
        }
      } catch { /* noop */ }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      const updatePayload: Record<string, unknown> = {
        ga4_access_token: tokens.access_token,
        ga4_token_expires_at: expiresAt,
        ga4_account_email: email,
      };
      if (tokens.refresh_token) updatePayload.ga4_refresh_token = tokens.refresh_token;

      const { error: upErr } = await admin
        .from("stores")
        .update(updatePayload)
        .eq("id", storeId)
        .eq("user_id", userId);
      if (upErr) throw new Error(`Failed to save tokens: ${upErr.message}`);

      return htmlResponse({ success: true, email }, req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("google-oauth-callback error:", msg);
      return htmlResponse({ success: false, error: msg }, req);
    }
  }

  return new Response(JSON.stringify({ error: "Invalid request" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
