import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";
import {
  invokePostIntegrationSetupFromCallback,
  invokeRegisterWebhooksFromCallback,
} from "../_shared/internal-callback.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://ltvboost.lovable.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function logOAuth(
  requestId: string,
  phase: "start" | "callback" | "persist",
  fields: Record<string, unknown>,
) {
  console.log(JSON.stringify({ request_id: requestId, platform: "woocommerce", phase, ...fields }));
}

async function parseWooCallbackBody(req: Request): Promise<Record<string, string>> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  if (ct.includes("application/json")) {
    try {
      const j = await req.json() as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(j).map(([k, v]) => [k, v == null ? "" : String(v)]),
      );
    } catch {
      return {};
    }
  }
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    if (raw.trim().startsWith("{")) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(j).map(([k, v]) => [k, v == null ? "" : String(v)]),
      );
    }
  } catch {
    /* fall through */
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── START: Generate WooCommerce auth URL ─────────────────────────────────
  if (action === "start") {
    const auth = await verifyJwt(req);
    if (!auth.ok) return auth.response;

    const storeId = url.searchParams.get("store_id");
    const siteUrl = url.searchParams.get("site_url");
    const returnTo = url.searchParams.get("return_to") ?? "onboarding"; // onboarding | integracoes

    if (!storeId || !siteUrl) return errorResponse("store_id and site_url required", 400);

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
      platform: "woocommerce",
      extra_data: { site_url: siteUrl, return_to: returnTo },
    });

    const callbackUrl = `${SUPABASE_URL}/functions/v1/oauth-woocommerce?action=callback`;
    const cleanSiteUrl = siteUrl.replace(/\/$/, "");

    const returnPath =
      returnTo === "integracoes" ? "/dashboard/integracoes" : "/onboarding";
    const returnUrl = `${APP_URL}${returnPath}?oauth=connected&platform=woocommerce`;

    const wcAuthUrl =
      `${cleanSiteUrl}/wc-auth/v1/authorize?app_name=LTV+Boost&scope=read_write&user_id=${stateToken}` +
      `&return_url=${encodeURIComponent(returnUrl)}&callback_url=${encodeURIComponent(callbackUrl)}`;

    logOAuth(requestId, "start", { store_id: storeId, ok: true, return_to: returnTo });
    return jsonResponse({ url: wcAuthUrl });
  }

  // ── CALLBACK: WooCommerce posts consumer_key/consumer_secret ─────────────
  if (action === "callback" && req.method === "POST") {
    const body = await parseWooCallbackBody(req);

    const stateToken = body.user_id;
    const consumerKey = body.consumer_key;
    const consumerSecret = body.consumer_secret;

    if (!stateToken || !consumerKey || !consumerSecret) {
      logOAuth(requestId, "callback", { ok: false, detail: "missing_fields" });
      return errorResponse("Missing fields", 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: states } = await admin.rpc("consume_oauth_state", { p_token: stateToken });
    const st = states?.[0];
    if (!st) {
      logOAuth(requestId, "callback", { ok: false, detail: "invalid_or_expired_state" });
      return errorResponse("Invalid or expired state", 403);
    }

    const extra = (st.extra_data ?? {}) as { site_url?: string; return_to?: string };
    const siteUrl = extra.site_url || "";

    await admin.from("integrations").upsert(
      {
        user_id: st.user_id,
        store_id: st.store_id,
        type: "woocommerce",
        name: "WooCommerce",
        config: { site_url: siteUrl, consumer_key: consumerKey, consumer_secret: consumerSecret },
        is_active: true,
        connection_mode: "oauth",
        connection_status: "connected",
      },
      { onConflict: "store_id,type" },
    );

    logOAuth(requestId, "callback", { store_id: st.store_id, ok: true, detail: "persisted" });

    invokePostIntegrationSetupFromCallback(st.user_id).catch(() => {});
    invokeRegisterWebhooksFromCallback(st.store_id, st.user_id, "woocommerce").catch(() => {});

    return jsonResponse({ success: true });
  }

  return errorResponse("Unknown action", 400);
});
