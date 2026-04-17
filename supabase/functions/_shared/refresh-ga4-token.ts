/**
 * Shared helper to ensure a store's GA4 access token is valid.
 * If expired, exchanges the refresh_token via Google's OAuth endpoint and persists the new token.
 *
 * Usage:
 *   const accessToken = await ensureFreshGa4AccessToken(supabase, storeId);
 */
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Ga4Tokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

const SAFETY_WINDOW_MS = 60_000; // refresh 1 min before expiry

export async function ensureFreshGa4AccessToken(
  supabase: SupabaseClient,
  storeId: string,
): Promise<string> {
  const { data: store, error } = await supabase
    .from("stores")
    .select("ga4_access_token, ga4_refresh_token, ga4_token_expires_at")
    .eq("id", storeId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load store ${storeId}: ${error.message}`);
  if (!store) throw new Error(`Store ${storeId} not found`);

  const access = store.ga4_access_token as string | null;
  const refresh = store.ga4_refresh_token as string | null;
  const expiresAt = store.ga4_token_expires_at as string | null;

  // No token at all
  if (!access && !refresh) {
    throw new Error("Store has no GA4 OAuth credentials configured");
  }

  // Still valid (with safety window)
  if (access && expiresAt && Date.parse(expiresAt) - Date.now() > SAFETY_WINDOW_MS) {
    return access;
  }

  // Need to refresh
  if (!refresh) {
    // No refresh token (legacy manual entry) — return whatever we have and let the caller fail
    if (access) return access;
    throw new Error("GA4 access token expired and no refresh_token available");
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/SECRET not configured in Supabase secrets");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();

  await supabase
    .from("stores")
    .update({
      ga4_access_token: json.access_token,
      ga4_token_expires_at: newExpiresAt,
    })
    .eq("id", storeId);

  return json.access_token;
}

/**
 * Convenience factory for callers that only have URL/SERVICE_ROLE env.
 */
export function makeServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
