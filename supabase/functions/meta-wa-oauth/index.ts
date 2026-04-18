/**
 * meta-wa-oauth
 *
 * Receives the OAuth code from Meta Embedded Signup,
 * exchanges it for a long-lived token, fetches WABA + phone number IDs,
 * upserts a whatsapp_connections row (idempotent on store_id + phone_number_id),
 * subscribes the webhook, and writes an audit log entry.
 *
 * IMPORTANT: All error responses use HTTP 200 with `{ ok: false, error, code, diagnostics }`
 * because the Supabase client SDK discards bodies of non-2xx responses, hiding the real error.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge-utils.ts";

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION")?.trim() || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Always status 200 so the SDK delivers the body to the client. */
function failure(
  code:
    | "unauthorized"
    | "bad_request"
    | "store_not_found"
    | "forbidden"
    | "missing_secrets"
    | "exchange_failed"
    | "long_lived_failed"
    | "debug_token_failed"
    | "no_waba_found"
    | "persist_failed"
    | "internal_error",
  error: string,
  diagnostics?: Record<string, unknown>,
) {
  console.error("META_OAUTH_ERR", { code, error, diagnostics });
  return jsonResponse({ ok: false, code, error, diagnostics: diagnostics ?? null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- Auth ---
    // Use service role as apikey to avoid HS256/ES256 mismatch on the gateway;
    // the user JWT is still validated via getUser() against the Authorization header.
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: authErr } = await supabase.auth.getClaims(token);
    const user = claimsData?.claims ? { id: claimsData.claims.sub as string } : null;
    if (authErr || !user) {
      return failure("unauthorized", "Sessão inválida. Faça login novamente.", {
        auth_error: authErr?.message,
      });
    }

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const { code, store_id, instance_name } = body as {
      code?: string;
      store_id?: string;
      instance_name?: string;
    };
    if (!code || !store_id) {
      return failure("bad_request", "code and store_id are required", {
        has_code: Boolean(code),
        has_store_id: Boolean(store_id),
      });
    }

    // --- Secrets ---
    const appId = Deno.env.get("META_APP_ID") ?? "";
    const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
    const serviceRole = serviceRoleKey;
    if (!appId || !appSecret) {
      return failure(
        "missing_secrets",
        "META_APP_ID / META_APP_SECRET não configurados nos Secrets do Supabase.",
        { has_app_id: Boolean(appId), has_app_secret: Boolean(appSecret) },
      );
    }
    if (!serviceRole) {
      return failure("missing_secrets", "SUPABASE_SERVICE_ROLE_KEY não configurado.");
    }

    // --- Authorize: user must own or be team-member of the store ---
    const adminClient = createClient(supabaseUrl, serviceRole);
    const { data: storeRow, error: storeErr } = await adminClient
      .from("stores")
      .select("id, user_id")
      .eq("id", store_id)
      .maybeSingle();
    if (storeErr || !storeRow) {
      return failure("store_not_found", "Loja não encontrada.", { store_error: storeErr?.message });
    }

    if (storeRow.user_id !== user.id) {
      const { data: tm } = await adminClient
        .from("team_members")
        .select("id")
        .eq("account_owner_id", storeRow.user_id)
        .eq("invited_user_id", user.id)
        .eq("status", "active")
        .in("role", ["admin", "operator"])
        .maybeSingle();
      if (!tm) return failure("forbidden", "Sem permissão para conectar nesta loja.");
    }

    // --- Step 1: Exchange code for short-lived token ---
    const tokenUrl = `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      const metaErr = tokenData?.error ?? {};
      const message = metaErr.message ||
        tokenData?.error_description ||
        `Troca de código falhou (HTTP ${tokenRes.status}).`;
      return failure("exchange_failed", message, {
        http_status: tokenRes.status,
        meta_error_type: metaErr.type,
        meta_error_code: metaErr.code,
        meta_error_subcode: metaErr.error_subcode,
        meta_message: metaErr.message,
        graph_version: GRAPH_VERSION,
        app_id_prefix: appId.slice(0, 6),
      });
    }

    // --- Step 2: Long-lived token ---
    const llUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`;
    const llRes = await fetch(llUrl);
    const llData = await llRes.json().catch(() => ({}));
    if (!llRes.ok) {
      console.error("META_OAUTH_ERR long_lived (continuing with short-lived)", {
        http_status: llRes.status,
        meta_error: llData?.error,
      });
    }
    const accessToken: string = llData.access_token ?? tokenData.access_token;
    const expiresIn: number = llData.expires_in ?? tokenData.expires_in ?? 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // --- Step 3: Discover WABA via debug_token ---
    const debugRes = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
    );
    const debugData = await debugRes.json().catch(() => ({}));
    if (!debugRes.ok) {
      return failure("debug_token_failed", debugData?.error?.message ?? "debug_token falhou", {
        http_status: debugRes.status,
        meta_error: debugData?.error,
      });
    }
    const granularScopes = debugData?.data?.granular_scopes ?? [];
    const wabaScope = granularScopes.find(
      (s: { scope: string }) => s.scope === "whatsapp_business_messaging",
    );
    const wabaIds: string[] = wabaScope?.target_ids ?? [];

    let metaPhoneNumberId = "";
    let metaWabaId = wabaIds[0] ?? "";
    let metaBusinessId = "";
    let displayPhoneNumber = "";
    let webhookSubscribed = false;

    // --- Step 4: Get phone number from WABA ---
    if (metaWabaId) {
      const wabaInfoRes = await fetch(
        `${GRAPH}/${metaWabaId}?fields=id,name,owner_business_info`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const wabaInfo = await wabaInfoRes.json().catch(() => ({}));
      metaBusinessId = wabaInfo?.owner_business_info?.id ?? "";

      const phonesRes = await fetch(
        `${GRAPH}/${metaWabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const phonesData = await phonesRes.json().catch(() => ({}));
      const phones = phonesData?.data ?? [];
      if (phones.length > 0) {
        metaPhoneNumberId = phones[0].id;
        displayPhoneNumber = phones[0].display_phone_number ?? "";
      } else {
        console.error("META_OAUTH_ERR no_phone_numbers", {
          waba_id: metaWabaId,
          phones_response: phonesData,
        });
      }

      // --- Step 5: Subscribe app to WABA (auto-register webhook) ---
      const webhookUrl = `${supabaseUrl}/functions/v1/meta-whatsapp-webhook`;
      try {
        const subRes = await fetch(`${GRAPH}/${metaWabaId}/subscribed_apps`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ override_callback_url: webhookUrl }),
        });
        webhookSubscribed = subRes.ok;
        if (!subRes.ok) {
          const subErr = await subRes.json().catch(() => ({}));
          console.error("META_OAUTH_ERR webhook_subscribe", {
            http_status: subRes.status,
            meta_error: subErr?.error,
          });
        }
      } catch (e) {
        console.error("META_OAUTH_ERR webhook_subscribe_throw", {
          message: e instanceof Error ? e.message : String(e),
        });
        webhookSubscribed = false;
      }
    } else {
      console.error("META_OAUTH_ERR no_waba_found", {
        granular_scopes: granularScopes,
      });
    }

    // --- Step 6: Upsert connection (idempotent on store_id + meta_phone_number_id) ---
    const connName = (instance_name?.trim()) || `Meta ${displayPhoneNumber || metaWabaId || "WhatsApp"}`;
    const status = metaPhoneNumberId ? "connected" : "disconnected";
    const nowIso = new Date().toISOString();

    const baseRow = {
      user_id: user.id,
      store_id,
      instance_name: connName,
      status,
      provider: "meta_cloud",
      meta_phone_number_id: metaPhoneNumberId || null,
      meta_waba_id: metaWabaId || null,
      meta_access_token: accessToken,
      meta_token_expires_at: expiresAt,
      meta_business_id: metaBusinessId || null,
      meta_api_version: GRAPH_VERSION,
      phone_number: displayPhoneNumber || null,
      connected_at: metaPhoneNumberId ? nowIso : null,
    };

    let inserted: { id: string; instance_name: string; status: string; meta_phone_number_id: string | null } | null = null;
    let upsertErr: { message: string } | null = null;

    if (metaPhoneNumberId) {
      const result = await adminClient
        .from("whatsapp_connections")
        .upsert(baseRow, { onConflict: "store_id,meta_phone_number_id" })
        .select("id, instance_name, status, meta_phone_number_id")
        .single();
      inserted = result.data as typeof inserted;
      upsertErr = result.error;
    } else {
      // Sem phone_number_id não existe chave única — apenas insere.
      const result = await adminClient
        .from("whatsapp_connections")
        .insert(baseRow)
        .select("id, instance_name, status, meta_phone_number_id")
        .single();
      inserted = result.data as typeof inserted;
      upsertErr = result.error;
    }

    if (upsertErr || !inserted) {
      return failure("persist_failed", upsertErr?.message ?? "Falha ao salvar conexão.", {
        had_phone_number_id: Boolean(metaPhoneNumberId),
        waba_id: metaWabaId,
      });
    }

    // --- Step 7: Audit log ---
    try {
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        store_id,
        action: "whatsapp_embedded_signup",
        resource: `whatsapp_connections:${inserted.id}`,
        result: status,
        metadata: {
          waba_id: metaWabaId,
          phone_number_id: metaPhoneNumberId,
          display_phone_number: displayPhoneNumber,
          webhook_subscribed: webhookSubscribed,
          graph_version: GRAPH_VERSION,
        },
      });
    } catch {
      // Audit failure must not break the flow.
    }

    return jsonResponse({
      ok: true,
      connection: inserted,
      display_phone_number: displayPhoneNumber,
      waba_id: metaWabaId,
      webhook_subscribed: webhookSubscribed,
    });
  } catch (err) {
    return failure(
      "internal_error",
      err instanceof Error ? err.message : "Internal error",
      { stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined },
    );
  }
});
