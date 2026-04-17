/**
 * Server-to-server calls from OAuth callbacks (no end-user JWT).
 * Requires EDGE_INTERNAL_CALLBACK_SECRET in Supabase secrets (same value for all callers).
 */

const JSON_CT = "application/json";

export async function invokePostIntegrationSetupFromCallback(userId: string): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("EDGE_INTERNAL_CALLBACK_SECRET");
  if (!base || !anon || !service || !secret) {
    console.warn(
      JSON.stringify({
        phase: "persist",
        fn: "post-integration-setup",
        ok: false,
        detail: "missing_env_or_secret",
      }),
    );
    return;
  }
  const res = await fetch(`${base}/functions/v1/post-integration-setup`, {
    method: "POST",
    headers: {
      "Content-Type": JSON_CT,
      apikey: anon,
      Authorization: `Bearer ${service}`,
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(
      JSON.stringify({
        phase: "persist",
        fn: "post-integration-setup",
        ok: false,
        status: res.status,
        detail: t.slice(0, 500),
      }),
    );
  }
}

export async function invokeRegisterWebhooksFromCallback(
  storeId: string,
  userId: string,
  platform: "shopify" | "woocommerce" | "nuvemshop" | "vtex" | "yampi" | "tray",
): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("EDGE_INTERNAL_CALLBACK_SECRET");
  if (!base || !anon || !service || !secret) {
    console.warn(
      JSON.stringify({
        phase: "persist",
        fn: "register-webhooks",
        ok: false,
        detail: "missing_env_or_secret",
        store_id: storeId,
        platform,
      }),
    );
    return;
  }
  const res = await fetch(`${base}/functions/v1/register-webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": JSON_CT,
      apikey: anon,
      Authorization: `Bearer ${service}`,
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ store_id: storeId, user_id: userId, platform }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(
      JSON.stringify({
        phase: "persist",
        fn: "register-webhooks",
        ok: false,
        status: res.status,
        store_id: storeId,
        platform,
        detail: t.slice(0, 500),
      }),
    );
  }
}
