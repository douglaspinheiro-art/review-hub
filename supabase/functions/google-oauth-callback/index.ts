/**
 * Google OAuth callback for GA4 connection.
 *
 * Two modes:
 *   GET  ?action=start&store_id=...   → returns { url } to start the OAuth dance
 *   GET  ?code=...&state=...          → Google redirects here; exchanges code → tokens, persists in stores, returns HTML that posts a message to the opener and closes
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function callbackUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return `${supabaseUrl}/functions/v1/google-oauth-callback`;
}

function htmlResponse(payload: Record<string, unknown>): Response {
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
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

serve(async (req: Request) => {
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
    const userId = claims.claims.sub;
    const storeId = url.searchParams.get("store_id");
    if (!storeId) {
      return new Response(JSON.stringify({ error: "store_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = `${userId}:${storeId}:${crypto.randomUUID()}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Mode 2: Google redirect ──
  if (code && stateParam) {
    try {
      const [userId, storeId] = stateParam.split(":");
      if (!userId || !storeId) throw new Error("Invalid state");

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

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const updatePayload: Record<string, unknown> = {
        ga4_access_token: tokens.access_token,
        ga4_token_expires_at: expiresAt,
        ga4_account_email: email,
      };
      if (tokens.refresh_token) updatePayload.ga4_refresh_token = tokens.refresh_token;

      const { error: upErr } = await supabase
        .from("stores")
        .update(updatePayload)
        .eq("id", storeId)
        .eq("user_id", userId);
      if (upErr) throw new Error(`Failed to save tokens: ${upErr.message}`);

      return htmlResponse({ success: true, email });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("google-oauth-callback error:", msg);
      return htmlResponse({ success: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ error: "Invalid request" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
