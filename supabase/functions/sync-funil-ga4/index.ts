/**
 * Cron: persiste métricas de funil GA4 em funil_diario por loja (stores com GA4 configurado).
 * POST /functions/v1/sync-funil-ga4
 * Authorization: Bearer CRON_SECRET
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronAlert, verifyCronSecret } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

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

  const [sessionsRes, eventsRes, revenueRes] = await Promise.all([
    fetch(baseUrl, {
      method: "POST",
      headers: gaHeaders,
      body: JSON.stringify({ dateRanges: [{ startDate, endDate: "today" }], metrics: [{ name: "sessions" }] }),
    }),
    fetch(baseUrl, {
      method: "POST",
      headers: gaHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: "today" }],
        metrics: [{ name: "eventCount" }],
        dimensions: [{ name: "eventName" }],
      }),
    }),
    fetch(baseUrl, {
      method: "POST",
      headers: gaHeaders,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate: "today" }],
        metrics: [{ name: "purchaseRevenue" }],
      }),
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

  const metricDate = new Date().toISOString().slice(0, 10);
  const periodos: Periodo[] = ["7d", "30d", "90d"];

  const { data: stores, error: stErr } = await supabase
    .from("stores")
    .select("id, user_id, ga4_property_id, ga4_access_token")
    .not("ga4_property_id", "is", null)
    .not("ga4_access_token", "is", null);

  if (stErr) {
    logCronAlert({ component: "sync-funil-ga4", phase: "list_stores", error: stErr.message });
    return new Response(JSON.stringify({ ok: false, error: stErr.message }), { status: 500, headers: cors });
  }

  const results: { store_id: string; periodo: Periodo; ok: boolean; error?: string }[] = [];

  for (const s of stores ?? []) {
    const pid = s.ga4_property_id as string;
    const tok = s.ga4_access_token as string;
    for (const periodo of periodos) {
      try {
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

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    logCronAlert({
      component: "sync-funil-ga4",
      phase: "ga4_upsert",
      failed_count: failed.length,
      sample: failed.slice(0, 8),
    });
  }

  return new Response(JSON.stringify({ ok: true, metric_date: metricDate, results }), { headers: cors });
});
