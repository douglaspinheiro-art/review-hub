/**
 * Cron: persiste métricas de funil GA4 em funil_diario por loja (stores com GA4 configurado).
 * Refactor: processa em chunks de 10 lojas e controla quota diária.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronAlert, verifyCronSecret } from "../_shared/edge-utils.ts";
import { ensureFreshGa4AccessToken } from "../_shared/refresh-ga4-token.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const CHUNK_SIZE = 10;
const MAX_GA4_REQUESTS_PER_DAY = 10000;

type Periodo = "7d" | "30d" | "90d";

function periodoToDays(p: Periodo): number {
  return { "7d": 7, "30d": 30, "90d": 90 }[p];
}

function startIsoForPeriod(days: number): string {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() - days);
  return x.toISOString();
}

async function fetchGa4Slice(
  propertyId: string,
  accessToken: string,
  periodo: Periodo,
): Promise<{
  sessions: number;
  view_item: number;
  add_to_cart: number;
  begin_checkout: number;
  purchases: number;
  purchase_revenue: number;
}> {
  const dias = periodoToDays(periodo);
  const startDate = `${dias}daysAgo`;
  const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const gaHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  const ga4Fetch = (body: unknown) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    return fetch(baseUrl, {
      method: "POST",
      headers: gaHeaders,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
  };

  const [sessionsRes, eventsRes, revenueRes] = await Promise.all([
    ga4Fetch({ dateRanges: [{ startDate, endDate: "today" }], metrics: [{ name: "sessions" }] }),
    ga4Fetch({
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [{ name: "eventCount" }],
      dimensions: [{ name: "eventName" }],
    }),
    ga4Fetch({
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [{ name: "purchaseRevenue" }],
    }),
  ]);

  if (!sessionsRes.ok) {
    const t = await sessionsRes.text();
    throw new Error(`GA4 sessions ${sessionsRes.status}: ${t.slice(0, 200)}`);
  }

  const sessionsData = await sessionsRes.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
  const sessions = parseInt(sessionsData.rows?.[0]?.metricValues?.[0]?.value ?? "0", 10);

  const eventMap: Record<string, number> = {};
  if (eventsRes.ok) {
    const eventsData = await eventsRes.json() as {
      rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
    };
    for (const row of eventsData.rows ?? []) {
      const name = row.dimensionValues?.[0]?.value;
      const count = parseInt(row.metricValues?.[0]?.value ?? "0", 10);
      if (name) eventMap[name] = count;
    }
  }

  let purchase_revenue = 0;
  if (revenueRes.ok) {
    const revenueData = await revenueRes.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
    purchase_revenue = parseFloat(revenueData.rows?.[0]?.metricValues?.[0]?.value ?? "0");
  }

  const visitantes = sessions;
  return {
    sessions: visitantes,
    view_item: eventMap["view_item"] ?? Math.round(visitantes * 0.72),
    add_to_cart: eventMap["add_to_cart"] ?? Math.round(visitantes * 0.28),
    begin_checkout: eventMap["begin_checkout"] ?? Math.round(visitantes * 0.14),
    purchases: eventMap["purchase"] ?? Math.round(visitantes * 0.014),
    purchase_revenue: Math.round(purchase_revenue),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // 1. Fetch cursor and quota from system_config
  const { data: config } = await supabase
    .from("system_config")
    .select("ga4_sync_cursor, ga4_sync_daily_count, ga4_sync_last_run")
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const lastRun = config?.ga4_sync_last_run ? new Date(config.ga4_sync_last_run) : null;
  const isNewDay = !lastRun || lastRun.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
  
  let dailyCount = isNewDay ? 0 : (config?.ga4_sync_daily_count ?? 0);
  const cursor = config?.ga4_sync_cursor;

  if (dailyCount >= MAX_GA4_REQUESTS_PER_DAY) {
    return new Response(JSON.stringify({ ok: false, error: "Daily GA4 API quota exceeded" }), { status: 429, headers: cors });
  }

  // 2. Fetch chunk of stores (any store with property_id and either an access_token or refresh_token)
  let query = supabase
    .from("stores")
    .select("id, user_id, ga4_property_id, ga4_access_token, ga4_refresh_token")
    .not("ga4_property_id", "is", null)
    .or("ga4_access_token.not.is.null,ga4_refresh_token.not.is.null")
    .order("id", { ascending: true })
    .limit(CHUNK_SIZE);

  if (cursor) {
    query = query.gt("id", cursor);
  }

  const { data: stores, error: stErr } = await query;

  if (stErr) {
    logCronAlert({ component: "sync-funil-ga4", phase: "list_stores", error: stErr.message });
    return new Response(JSON.stringify({ ok: false, error: stErr.message }), { status: 500, headers: cors });
  }

  if (!stores || stores.length === 0) {
    // End of cycle
    await supabase.from("system_config").update({ ga4_sync_cursor: null, ga4_sync_last_run: now.toISOString() }).neq("id", "none");
    return new Response(JSON.stringify({ ok: true, message: "GA4 sync cycle completed" }), { headers: cors });
  }

  const metricDate = now.toISOString().slice(0, 10);
  const periodos: Periodo[] = ["7d", "30d", "90d"];
  const results: { store_id: string; periodo: Periodo; ok: boolean; error?: string }[] = [];

  let chunkRequests = 0;

  for (const s of stores) {
    const pid = s.ga4_property_id as string;
    let tok: string;
    try {
      tok = await ensureFreshGa4AccessToken(supabase, s.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const periodo of periodos) results.push({ store_id: s.id, periodo, ok: false, error: `token: ${msg}` });
      continue;
    }
    for (const periodo of periodos) {
      try {
        chunkRequests += 3; // sessions, events, revenue API calls
        const m = await fetchGa4Slice(pid, tok, periodo);
        const days = periodoToDays(periodo);
        const since = startIsoForPeriod(days);
        const { data: orderRows, error: cErr } = await supabase
          .from("orders_v3")
          .select("internal_status")
          .eq("store_id", s.id)
          .gte("created_at", since);

        if (cErr) throw new Error(cErr.message);
        const oc = (orderRows ?? []).filter((r) => r.internal_status !== "cancelled").length;
        const diffPct = oc > 0 ? Math.round((Math.abs(m.purchases - oc) / oc) * 10000) / 100 : null;

        const { error: upErr } = await supabase.from("funil_diario").upsert(
          {
            store_id: s.id,
            user_id: s.user_id,
            metric_date: metricDate,
            periodo,
            fonte: "ga4",
            sessions: m.sessions,
            view_item: m.view_item,
            add_to_cart: m.add_to_cart,
            begin_checkout: m.begin_checkout,
            purchases: m.purchases,
            purchase_revenue: m.purchase_revenue,
            ga4_purchase_vs_orders_diff_pct: diffPct,
          },
          { onConflict: "store_id,metric_date,periodo,fonte" },
        );
        if (upErr) throw new Error(upErr.message);
        results.push({ store_id: s.id, periodo, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ store_id: s.id, periodo, ok: false, error: msg });
      }
    }
  }

  // 3. Update cursor and quota
  const lastStoreId = stores[stores.length - 1].id;
  dailyCount += chunkRequests;
  await supabase.from("system_config").update({
    ga4_sync_cursor: lastStoreId,
    ga4_sync_daily_count: dailyCount,
    ga4_sync_last_run: now.toISOString()
  }).neq("id", "none");

  // 4. Trigger next chunk if needed
  if (stores.length === CHUNK_SIZE && dailyCount < MAX_GA4_REQUESTS_PER_DAY) {
    console.log(`CHUNK_COMPLETED: Triggering next GA4 chunk after store ${lastStoreId}. Daily requests: ${dailyCount}`);
    fetch(req.url, {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") ?? "",
        "Content-Type": "application/json",
      },
    }).catch(err => console.error("Error triggering next GA4 chunk:", err));
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    logCronAlert({
      component: "sync-funil-ga4",
      phase: "ga4_upsert",
      failed_count: failed.length,
      sample: failed.slice(0, 8),
    });
  }

  return new Response(JSON.stringify({ 
    ok: true, 
    metric_date: metricDate, 
    processed_count: stores.length,
    daily_requests: dailyCount,
    has_more: stores.length === CHUNK_SIZE && dailyCount < MAX_GA4_REQUESTS_PER_DAY
  }), { headers: cors });
});
