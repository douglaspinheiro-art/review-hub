/**
 * sync-google-reviews — pulls reviews from Google Business Profile into public.reviews.
 *
 * Auth: caller JWT. Resolves store via store_id query/body, requires the user to own the store.
 * Uses the same OAuth tokens stored in stores.ga4_* (now extended with business.manage scope).
 *
 * Body/Query: { store_id: string }
 * Pre-req: stores.google_business_account_id and google_business_location_id must be set.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error: claimsErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    let storeId: string | null = null;
    try {
      const body = await req.json();
      storeId = (body?.store_id ?? null) as string | null;
    } catch { /* allow query */ }
    if (!storeId) storeId = new URL(req.url).searchParams.get("store_id");
    if (!storeId) return json({ error: "store_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: store, error: storeErr } = await admin
      .from("stores")
      .select("id,user_id,ga4_access_token,ga4_refresh_token,ga4_token_expires_at,google_business_account_id,google_business_location_id")
      .eq("id", storeId)
      .single();
    if (storeErr || !store) return json({ error: "Store not found" }, 404);
    if (store.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (!store.google_business_account_id || !store.google_business_location_id) {
      return json({ error: "Conecte e selecione a localização do Google Business primeiro." }, 400);
    }
    if (!store.ga4_refresh_token && !store.ga4_access_token) {
      return json({ error: "Reconecte sua conta Google (sem token disponível)." }, 400);
    }

    // Refresh token if expired
    let accessToken = store.ga4_access_token as string | null;
    const expired = !store.ga4_token_expires_at || new Date(store.ga4_token_expires_at as string).getTime() < Date.now() + 60_000;
    if (expired && store.ga4_refresh_token) {
      const refreshed = await refreshAccessToken(store.ga4_refresh_token as string);
      accessToken = refreshed.access_token;
      await admin.from("stores").update({
        ga4_access_token: refreshed.access_token,
        ga4_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq("id", storeId);
    }
    if (!accessToken) return json({ error: "Falha ao obter access token" }, 500);

    // Google Business Profile API v4 (mybusinessbusinessinformation/legacy reviews)
    const reviewsUrl = `https://mybusiness.googleapis.com/v4/${store.google_business_account_id}/${store.google_business_location_id}/reviews?pageSize=50`;
    const r = await fetch(reviewsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) {
      const txt = await r.text();
      return json({ error: `Google API: ${r.status}`, detail: txt.slice(0, 400) }, 502);
    }
    const payload = await r.json() as { reviews?: Array<{ reviewId: string; reviewer?: { displayName?: string }; starRating?: string; comment?: string; createTime?: string }> };

    const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const rows = (payload.reviews ?? []).map((rv) => ({
      user_id: userId,
      platform: "google",
      reviewer_name: rv.reviewer?.displayName ?? "Anônimo",
      rating: rv.starRating ? STAR_MAP[rv.starRating] ?? 0 : 0,
      content: rv.comment ?? "",
      external_id: rv.reviewId,
      status: "pending",
      created_at: rv.createTime ?? new Date().toISOString(),
    }));

    let inserted = 0;
    if (rows.length) {
      const { error: upErr, count } = await admin
        .from("reviews")
        .upsert(rows, { onConflict: "platform,external_id", count: "exact" });
      if (upErr) return json({ error: `Failed to save reviews: ${upErr.message}` }, 500);
      inserted = count ?? rows.length;
    }

    return json({ success: true, fetched: rows.length, upserted: inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-google-reviews error:", msg);
    return json({ error: msg }, 500);
  }
});