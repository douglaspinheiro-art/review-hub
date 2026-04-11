/**
 * Cron agregado: snapshots de qualidade de dados, coortes de clientes, espelho de catálogo.
 * POST /functions/v1/data-pipeline-cron
 * Body opcional: { "jobs": ["quality","cohorts","catalog"] } — default todas.
 * Authorization: Bearer CRON_SECRET
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weekAgoIso(): string {
  return new Date(Date.now() - WEEK_MS).toISOString();
}

async function jobQuality(supabase: ReturnType<typeof createClient>, snapshotDate: string) {
  const since = weekAgoIso();
  const { data: stores } = await supabase.from("stores").select("id, user_id");

  for (const st of stores ?? []) {
    const sid = st.id as string;
    const { data: orders } = await supabase
      .from("orders_v3")
      .select("id, cliente_id, utm_source")
      .eq("store_id", sid)
      .gte("created_at", since);

    const list = orders ?? [];
    const total = list.length;
    if (total === 0) {
      await supabase.from("data_quality_snapshots").upsert(
        {
          store_id: sid,
          user_id: st.user_id,
          snapshot_date: snapshotDate,
          phone_fill_rate: null,
          utm_fill_rate: null,
          duplicate_order_rate: null,
          parse_error_rate: null,
          ga4_purchase_vs_orders_diff_pct: null,
          metadata: { note: "no_orders_7d" },
        },
        { onConflict: "store_id,snapshot_date" },
      );
      continue;
    }

    const ids = [...new Set(list.map((o) => o.cliente_id).filter(Boolean))] as string[];
    let phoneOk = 0;
    if (ids.length > 0) {
      const { data: custs } = await supabase.from("customers_v3").select("id, phone").in("id", ids);
      const pmap = new Map((custs ?? []).map((c) => [c.id, c.phone as string | null]));
      for (const o of list) {
        if (!o.cliente_id) continue;
        const ph = pmap.get(o.cliente_id)?.replace(/\D/g, "") ?? "";
        if (ph.length >= 12) phoneOk++;
      }
    }
    const utmOk = list.filter((o) => o.utm_source && String(o.utm_source).trim().length > 0).length;

    const { count: whTotal } = await supabase
      .from("webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("event_type", "ecommerce_order")
      .gte("created_at", since);

    const { count: dupTotal } = await supabase
      .from("webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("event_type", "ecommerce_order")
      .eq("status_processamento", "ignorado")
      .gte("created_at", since);

    const { data: latestFunil } = await supabase
      .from("funil_diario")
      .select("ga4_purchase_vs_orders_diff_pct")
      .eq("store_id", sid)
      .eq("periodo", "30d")
      .eq("fonte", "ga4")
      .order("metric_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("data_quality_snapshots").upsert(
      {
        store_id: sid,
        user_id: st.user_id,
        snapshot_date: snapshotDate,
        phone_fill_rate: Math.round((phoneOk / total) * 10000) / 100,
        utm_fill_rate: Math.round((utmOk / total) * 10000) / 100,
        duplicate_order_rate: whTotal && whTotal > 0
          ? Math.round(((dupTotal ?? 0) / whTotal) * 10000) / 100
          : null,
        parse_error_rate: null,
        ga4_purchase_vs_orders_diff_pct: latestFunil?.ga4_purchase_vs_orders_diff_pct ?? null,
        metadata: {},
      },
      { onConflict: "store_id,snapshot_date" },
    );
  }
}

async function jobCohorts(supabase: ReturnType<typeof createClient>) {
  const { data: stores } = await supabase.from("stores").select("id, user_id");

  for (const st of stores ?? []) {
    const sid = st.id as string;
    const { data: ord } = await supabase
      .from("orders_v3")
      .select("cliente_id, created_at")
      .eq("store_id", sid)
      .not("cliente_id", "is", null)
      .order("created_at", { ascending: true });

    const rows = ord ?? [];
    const firstByCustomer = new Map<string, Date>();
    const ordersByCustomer = new Map<string, Date[]>();

    for (const row of rows) {
      const cid = row.cliente_id as string;
      const d = new Date(row.created_at as string);
      if (!firstByCustomer.has(cid)) firstByCustomer.set(cid, d);
      if (!ordersByCustomer.has(cid)) ordersByCustomer.set(cid, []);
      ordersByCustomer.get(cid)!.push(d);
    }

    const cohortMap = new Map<
      string,
      { customers: Set<string>; firstDates: Map<string, Date> }
    >();

    for (const [cid, first] of firstByCustomer) {
      const cohortMonth = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-01`;
      if (!cohortMap.has(cohortMonth)) {
        cohortMap.set(cohortMonth, { customers: new Set(), firstDates: new Map() });
      }
      const c = cohortMap.get(cohortMonth)!;
      c.customers.add(cid);
      c.firstDates.set(cid, first);
    }

    for (const [cohortMonth, { customers, firstDates }] of cohortMap) {
      let retained = 0;
      for (const cid of customers) {
        const f = firstDates.get(cid)!;
        const end = new Date(f.getTime() + 30 * 86400000);
        const dates = ordersByCustomer.get(cid) ?? [];
        if (dates.some((d) => d.getTime() > f.getTime() && d.getTime() <= end.getTime())) retained++;
      }
      const size = customers.size;
      const retention_d30 = size > 0 ? Math.round((retained / size) * 10000) / 10000 : null;

      await supabase.from("customer_cohorts").upsert(
        {
          store_id: sid,
          user_id: st.user_id,
          cohort_month: cohortMonth,
          cohort_size: size,
          retention_d30,
        },
        { onConflict: "store_id,cohort_month" },
      );
    }
  }
}

async function jobCatalog(supabase: ReturnType<typeof createClient>) {
  const { data: stores } = await supabase.from("stores").select("id, user_id");

  for (const st of stores ?? []) {
    const sid = st.id as string;
    const { data: products } = await supabase.from("produtos").select("sku, nome, estoque").eq("store_id", sid);
    const captured = new Date().toISOString();
    for (const p of products ?? []) {
      await supabase.from("catalog_snapshot").insert({
        store_id: sid,
        user_id: st.user_id,
        sku: (p.sku as string) || "unknown",
        product_name: (p.nome as string) || null,
        stock_qty: p.estoque != null ? Number(p.estoque) : null,
        captured_at: captured,
      });
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const denied = verifyCronSecret(req);
  if (denied) return denied;

  let jobs: string[] = ["quality", "cohorts", "catalog"];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.jobs) && body.jobs.length > 0) jobs = body.jobs.map(String);
  } catch { /* default */ }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const out: Record<string, string> = {};
  if (jobs.includes("quality")) {
    await jobQuality(supabase, snapshotDate);
    out.quality = "ok";
  }
  if (jobs.includes("cohorts")) {
    await jobCohorts(supabase);
    out.cohorts = "ok";
  }
  if (jobs.includes("catalog")) {
    await jobCatalog(supabase);
    out.catalog = "ok";
  }

  return new Response(JSON.stringify({ ok: true, snapshot_date: snapshotDate, jobs: out }), { headers: cors });
});
