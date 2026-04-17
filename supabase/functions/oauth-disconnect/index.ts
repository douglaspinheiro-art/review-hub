/**
 * OAuth Disconnect / Revoke
 *
 * - Marca a integração como desconectada (is_active=false, connection_status='disconnected')
 * - Tenta revogar webhooks remotos quando a plataforma suporta (Shopify, Nuvemshop, Tray, Woo)
 * - Não bloqueia o usuário se a revogação remota falhar (best-effort)
 *
 * POST /functions/v1/oauth-disconnect
 * Body: { store_id: UUID, type: string }
 * Auth: JWT do usuário
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, verifyJwt } from "../_shared/edge-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

type Config = Record<string, unknown>;

function log(reqId: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ request_id: reqId, fn: "oauth-disconnect", ...fields }));
}

async function revokeShopify(config: Config): Promise<{ ok: boolean; detail?: string }> {
  try {
    const shop = String(config.shop_url ?? "").replace(/\/$/, "");
    const token = String(config.access_token ?? "");
    if (!shop || !token) return { ok: false, detail: "missing_credentials" };

    const base = `https://${shop}/admin/api/2024-01`;
    const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

    // List + delete webhooks pointing to our callbacks
    const listRes = await fetch(`${base}/webhooks.json`, { headers });
    if (listRes.ok) {
      const { webhooks = [] } = await listRes.json();
      for (const w of webhooks as Array<{ id: number; address: string }>) {
        if (w.address?.includes(SUPABASE_URL)) {
          await fetch(`${base}/webhooks/${w.id}.json`, { method: "DELETE", headers }).catch(() => {});
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function revokeNuvemshop(config: Config): Promise<{ ok: boolean; detail?: string }> {
  try {
    const userId = String(config.user_id ?? "");
    const token = String(config.access_token ?? "");
    if (!userId || !token) return { ok: false, detail: "missing_credentials" };

    const base = `https://api.tiendanube.com/v1/${userId}`;
    const headers = {
      Authentication: `bearer ${token}`,
      "User-Agent": "LTVBoost (suporte@ltvboost.com.br)",
    };
    const listRes = await fetch(`${base}/webhooks`, { headers });
    if (listRes.ok) {
      const hooks = (await listRes.json()) as Array<{ id: number; url: string }>;
      for (const w of hooks) {
        if (w.url?.includes(SUPABASE_URL)) {
          await fetch(`${base}/webhooks/${w.id}`, { method: "DELETE", headers }).catch(() => {});
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function revokeWooCommerce(config: Config): Promise<{ ok: boolean; detail?: string }> {
  try {
    const site = String(config.site_url ?? "").replace(/\/$/, "");
    const ck = String(config.consumer_key ?? "");
    const cs = String(config.consumer_secret ?? "");
    if (!site || !ck || !cs) return { ok: false, detail: "missing_credentials" };

    const auth = "Basic " + btoa(`${ck}:${cs}`);
    const base = `${site}/wp-json/wc/v3`;
    const listRes = await fetch(`${base}/webhooks?per_page=100`, {
      headers: { Authorization: auth },
    });
    if (listRes.ok) {
      const hooks = (await listRes.json()) as Array<{ id: number; delivery_url: string }>;
      for (const w of hooks) {
        if (w.delivery_url?.includes(SUPABASE_URL)) {
          await fetch(`${base}/webhooks/${w.id}?force=true`, {
            method: "DELETE",
            headers: { Authorization: auth },
          }).catch(() => {});
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function revokeTray(config: Config): Promise<{ ok: boolean; detail?: string }> {
  try {
    const apiAddress = String(config.api_address ?? "").replace(/\/$/, "");
    const token = String(config.access_token ?? "");
    if (!apiAddress || !token) return { ok: false, detail: "missing_credentials" };

    const listRes = await fetch(
      `https://${apiAddress}/web_api/hooks?access_token=${encodeURIComponent(token)}`,
    );
    if (listRes.ok) {
      const data = await listRes.json();
      const hooks = (data?.Hooks ?? []) as Array<{ Hook: { id: number; url: string } }>;
      for (const h of hooks) {
        if (h.Hook?.url?.includes(SUPABASE_URL)) {
          await fetch(
            `https://${apiAddress}/web_api/hooks/${h.Hook.id}?access_token=${encodeURIComponent(token)}`,
            { method: "DELETE" },
          ).catch(() => {});
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const requestId = crypto.randomUUID();
  const auth = await verifyJwt(req);
  if (!auth.ok) return auth.response;

  let body: { store_id?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { store_id, type } = body;
  if (!store_id || !type) return errorResponse("store_id and type required", 400);

  // Verify access
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { error: aclErr } = await authClient.rpc("assert_store_access", { p_store_id: store_id });
  if (aclErr) {
    log(requestId, { ok: false, store_id, type, detail: "store_access_denied" });
    return errorResponse("Forbidden: store access denied", 403);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch integration to get config (for revoke)
  const { data: integ } = await admin
    .from("integrations")
    .select("id, type, config")
    .eq("store_id", store_id)
    .eq("type", type)
    .maybeSingle();

  // Best-effort revoke
  let revokeResult: { ok: boolean; detail?: string } = { ok: true };
  const config = (integ?.config ?? {}) as Config;
  switch (type) {
    case "shopify": revokeResult = await revokeShopify(config); break;
    case "nuvemshop": revokeResult = await revokeNuvemshop(config); break;
    case "woocommerce": revokeResult = await revokeWooCommerce(config); break;
    case "tray": revokeResult = await revokeTray(config); break;
    default: revokeResult = { ok: true, detail: "no_remote_revoke_for_platform" };
  }

  // Mark disconnected (keep row for audit; clear sensitive token fields)
  const sanitizedConfig: Config = {};
  for (const k of Object.keys(config)) {
    if (!/token|secret|key|password/i.test(k)) sanitizedConfig[k] = config[k];
  }

  const { error: updErr } = await admin
    .from("integrations")
    .update({
      is_active: false,
      connection_status: "disconnected",
      config: sanitizedConfig,
    })
    .eq("store_id", store_id)
    .eq("type", type);

  if (updErr) {
    log(requestId, { ok: false, store_id, type, detail: updErr.message });
    return errorResponse(`Failed to update integration: ${updErr.message}`, 500);
  }

  log(requestId, { ok: true, store_id, type, revoke_ok: revokeResult.ok, revoke_detail: revokeResult.detail });
  return jsonResponse({
    success: true,
    revoked: revokeResult.ok,
    detail: revokeResult.detail ?? null,
  });
});
