/**
 * Cron agregado: snapshots de qualidade de dados, coortes de clientes, espelho de catálogo.
 * Refactor: processa em chunks de 10 lojas para evitar timeout.
 * POST /functions/v1/data-pipeline-cron
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronAlert, verifyCronSecret } from "../_shared/edge-utils.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CHUNK_SIZE = 10;

function weekAgoIso(): string {
  return new Date(Date.now() - WEEK_MS).toISOString();
}

async function jobQuality(supabase: any, snapshotDate: string, stores: any[]) {
  const since = weekAgoIso();
  for (const st of stores) {
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

    const ids = [...new Set(list.map((o: Record<string, unknown>) => o.cliente_id).filter(Boolean))] as string[];
    let phoneOk = 0;
    if (ids.length > 0) {
      const { data: custs } = await supabase.from("customers_v3").select("id, phone").in("id", ids);
      const pmap = new Map((custs ?? []).map((c: Record<string, unknown>) => [c.id as string, c.phone as string | null]));
      for (const o of list as Array<Record<string, unknown>>) {
        if (!o.cliente_id) continue;
        const ph = pmap.get(o.cliente_id as string)?.replace(/\D/g, "") ?? "";
        if (ph.length >= 12) phoneOk++;
      }
    }
    const utmOk = (list as Array<Record<string, unknown>>).filter((o) => o.utm_source && String(o.utm_source).trim().length > 0).length;

    const { count: whTotal } = await supabase
      .from("webhook_logs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("event_type", "ecommerce_order")
      .gte("created_at", since);

    const { count: dupTotal } = await supabase
      .from("webhook_logs")
      .select("id", { count: "exact", head: true })
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

// Only look at the last 13 months to bound memory usage.
// retention_d30 only needs first-order month + 30-day window, so 13 months is sufficient.
const COHORT_WINDOW_DAYS = 13 * 31;
const COHORT_PAGE_SIZE = 2000;

async function jobCohorts(supabase: any, stores: any[]) {
  const since = new Date(Date.now() - COHORT_WINDOW_DAYS * 86400000).toISOString();

  for (const st of stores) {
    const sid = st.id as string;
    const firstByCustomer = new Map<string, Date>();
    const ordersByCustomer = new Map<string, Date[]>();

    // Paginated fetch to avoid loading millions of rows into memory at once.
    let cursor: string | null = null;
    while (true) {
      let q = supabase
        .from("orders_v3")
        .select("id, cliente_id, created_at")
        .eq("store_id", sid)
        .not("cliente_id", "is", null)
        .gte("created_at", since)
        .order("id", { ascending: true })
        .limit(COHORT_PAGE_SIZE);
      if (cursor) q = q.gt("id", cursor);

      const { data: page, error } = await q;
      if (error) throw error;
      const rows = page ?? [];

      for (const row of rows) {
        const cid = row.cliente_id as string;
        const d = new Date(row.created_at as string);
        if (!firstByCustomer.has(cid)) firstByCustomer.set(cid, d);
        if (!ordersByCustomer.has(cid)) ordersByCustomer.set(cid, []);
        ordersByCustomer.get(cid)!.push(d);
      }

      if (rows.length < COHORT_PAGE_SIZE) break;
      cursor = rows[rows.length - 1].id as string;
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

    const upsertRows: any[] = [];
    for (const [cohortMonth, { customers, firstDates }] of cohortMap) {
      let retained = 0;
      for (const cid of customers) {
        const f = firstDates.get(cid)!;
        const end = new Date(f.getTime() + 30 * 86400000);
        const dates = ordersByCustomer.get(cid) ?? [];
        if (dates.some((d) => d.getTime() > f.getTime() && d.getTime() <= end.getTime())) retained++;
      }
      const size = customers.size;
      upsertRows.push({
        store_id: sid,
        user_id: st.user_id,
        cohort_month: cohortMonth,
        cohort_size: size,
        retention_d30: size > 0 ? Math.round((retained / size) * 10000) / 10000 : null,
      });
    }

    // Batch upsert all cohort months for this store in one call.
    if (upsertRows.length > 0) {
      await supabase.from("customer_cohorts").upsert(upsertRows, { onConflict: "store_id,cohort_month" });
    }
  }
}

const CATALOG_BATCH_SIZE = 500;
const CATALOG_API_PAGE_SIZE = 100;

/**
 * Fetches products from the e-commerce platform API and upserts into catalog_snapshot.
 * Falls back to local `produtos` table if no integration is found.
 */
async function jobCatalog(supabase: any, stores: any[]) {
  for (const st of stores) {
    const sid = st.id as string;

    // Try to fetch from e-commerce API first
    const { data: integration } = await supabase
      .from("integrations")
      .select("type, config")
      .eq("store_id", sid)
      .eq("is_active", true)
      .in("type", ["shopify", "woocommerce", "nuvemshop", "magento", "yampi", "tray", "shopee"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const captured = new Date().toISOString();
    let rows: any[] = [];

    if (integration) {
      try {
        rows = await fetchCatalogFromPlatform(integration.type, integration.config, sid, st.user_id, captured);
      } catch (e) {
        console.warn(`Catalog API fetch failed for store ${sid} (${integration.type}): ${(e as Error).message}`);
        // Fall back to local produtos table
        rows = await fetchCatalogFromLocal(supabase, sid, st.user_id, captured);
      }
    } else {
      rows = await fetchCatalogFromLocal(supabase, sid, st.user_id, captured);
    }

    // Batch insert in chunks
    for (let i = 0; i < rows.length; i += CATALOG_BATCH_SIZE) {
      const batch = rows.slice(i, i + CATALOG_BATCH_SIZE);
      await supabase.from("catalog_snapshot").insert(batch);
    }
  }
}

async function fetchCatalogFromLocal(supabase: any, storeId: string, userId: string, captured: string): Promise<any[]> {
  const { data: products } = await supabase.from("produtos").select("sku, nome, estoque").eq("store_id", storeId);
  return (products ?? []).map((p: any) => ({
    store_id: storeId,
    user_id: userId,
    sku: (p.sku as string) || "unknown",
    product_name: (p.nome as string) || null,
    stock_qty: p.estoque != null ? Number(p.estoque) : null,
    captured_at: captured,
  }));
}

async function fetchCatalogFromPlatform(
  type: string,
  config: Record<string, string>,
  storeId: string,
  userId: string,
  captured: string,
): Promise<any[]> {
  switch (type) {
    case "shopify": return fetchShopifyCatalog(config, storeId, userId, captured);
    case "woocommerce": return fetchWooCommerceCatalog(config, storeId, userId, captured);
    case "nuvemshop": return fetchNuvemshopCatalog(config, storeId, userId, captured);
    case "magento": return fetchMagentoCatalog(config, storeId, userId, captured);
    default: return [];
  }
}

async function fetchShopifyCatalog(config: Record<string, string>, storeId: string, userId: string, captured: string): Promise<any[]> {
  const shop = config.shop_url?.replace(/\/$/, "");
  const token = config.access_token;
  if (!shop || !token) return [];

  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  let allProducts: any[] = [];
  let url: string | null = `https://${shop}/admin/api/2024-01/products.json?fields=id,title,variants,status&limit=250`;

  while (url && allProducts.length < 10_000) {
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const { products } = await res.json();
    allProducts = allProducts.concat(products ?? []);
    const linkHeader = res.headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  const rows: any[] = [];
  for (const p of allProducts) {
    const variants = p.variants ?? [{ id: p.id, sku: "", inventory_quantity: null }];
    for (const v of variants) {
      rows.push({
        store_id: storeId,
        user_id: userId,
        sku: v.sku || String(v.id),
        product_name: p.title,
        stock_qty: v.inventory_quantity ?? null,
        captured_at: captured,
      });
    }
  }
  return rows;
}

async function fetchWooCommerceCatalog(config: Record<string, string>, storeId: string, userId: string, captured: string): Promise<any[]> {
  const siteUrl = config.site_url?.replace(/\/$/, "");
  const ck = config.consumer_key;
  const cs = config.consumer_secret;
  if (!siteUrl || !ck || !cs) return [];

  const auth = btoa(`${ck}:${cs}`);
  const headers = { Authorization: `Basic ${auth}` };
  let allProducts: any[] = [];
  let page = 1;

  while (allProducts.length < 10_000) {
    const res = await fetch(`${siteUrl}/wp-json/wc/v3/products?per_page=${CATALOG_API_PAGE_SIZE}&page=${page}&_fields=id,name,sku,stock_quantity`, { headers });
    if (!res.ok) break;
    const products = await res.json();
    if (!Array.isArray(products) || products.length === 0) break;
    allProducts = allProducts.concat(products);
    if (products.length < CATALOG_API_PAGE_SIZE) break;
    page++;
  }

  return allProducts.map((p: any) => ({
    store_id: storeId,
    user_id: userId,
    sku: p.sku || String(p.id),
    product_name: p.name,
    stock_qty: p.stock_quantity ?? null,
    captured_at: captured,
  }));
}

async function fetchNuvemshopCatalog(config: Record<string, string>, storeId: string, userId: string, captured: string): Promise<any[]> {
  const nsUserId = config.user_id;
  const token = config.access_token;
  if (!nsUserId || !token) return [];

  const headers = {
    "Authentication": `bearer ${token}`,
    "User-Agent": "LTV Boost (suporte@ltvboost.com.br)",
  };

  const res = await fetch(`https://api.tiendanube.com/v1/${nsUserId}/products?per_page=200&fields=id,name,variants`, { headers });
  if (!res.ok) return [];
  const products = await res.json();

  const rows: any[] = [];
  for (const p of (Array.isArray(products) ? products : [])) {
    const variants = p.variants ?? [{ sku: "", stock: null }];
    for (const v of variants) {
      rows.push({
        store_id: storeId,
        user_id: userId,
        sku: v.sku || String(p.id),
        product_name: p.name?.pt || p.name?.es || String(p.id),
        stock_qty: v.stock ?? null,
        captured_at: captured,
      });
    }
  }
  return rows;
}

async function fetchMagentoCatalog(config: Record<string, string>, storeId: string, userId: string, captured: string): Promise<any[]> {
  const baseUrl = (config.base_url || config.api_url || "").replace(/\/$/, "");
  const token = config.access_token || config.integration_token;
  if (!baseUrl || !token) return [];

  const base = `${baseUrl.startsWith("https://") ? baseUrl : `https://${baseUrl}`}/rest/V1`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  let allProducts: any[] = [];
  let page = 1;

  while (allProducts.length < 10_000) {
    const res = await fetch(
      `${base}/products?searchCriteria[pageSize]=${CATALOG_API_PAGE_SIZE}&searchCriteria[currentPage]=${page}&fields=items[sku,name,extension_attributes[stock_item[qty]]],total_count`,
      { headers },
    );
    if (!res.ok) break;
    const data = await res.json();
    const items = data.items || [];
    allProducts = allProducts.concat(items);
    if (items.length < CATALOG_API_PAGE_SIZE || allProducts.length >= (data.total_count || 0)) break;
    page++;
  }

  return allProducts.map((p: any) => ({
    store_id: storeId,
    user_id: userId,
    sku: p.sku || "unknown",
    product_name: p.name || null,
    stock_qty: p.extension_attributes?.stock_item?.qty ?? null,
    captured_at: captured,
  }));
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
  
  // 1. Fetch cursor from system_config
  const { data: config } = await supabase
    .from("system_config")
    .select("data_pipeline_cursor")
    .limit(1)
    .maybeSingle();
  
  const cursor = config?.data_pipeline_cursor;

  // 2. Fetch chunk of stores
  let query = supabase.from("stores").select("id, user_id").order("id", { ascending: true }).limit(CHUNK_SIZE);
  if (cursor) {
    query = query.gt("id", cursor);
  }

  const { data: stores, error: storesErr } = await query;
  if (storesErr) throw storesErr;

  if (!stores || stores.length === 0) {
    // Pipeline finished for this cycle
    await supabase.from("system_config").update({ data_pipeline_cursor: null, data_pipeline_last_run: new Date().toISOString() }).neq("id", "none");
    return new Response(JSON.stringify({ ok: true, message: "Pipeline cycle completed" }), { headers: cors });
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const out: Record<string, string> = {};
  const jobErrors: Record<string, string> = {};

  if (jobs.includes("quality")) {
    try {
      await jobQuality(supabase, snapshotDate, stores);
      out.quality = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.quality = "error";
      jobErrors.quality = msg;
      logCronAlert({ component: "data-pipeline-cron", job: "quality", error: msg });
    }
  }
  if (jobs.includes("cohorts")) {
    try {
      await jobCohorts(supabase, stores);
      out.cohorts = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.cohorts = "error";
      jobErrors.cohorts = msg;
      logCronAlert({ component: "data-pipeline-cron", job: "cohorts", error: msg });
    }
  }
  if (jobs.includes("catalog")) {
    try {
      await jobCatalog(supabase, stores);
      out.catalog = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.catalog = "error";
      jobErrors.catalog = msg;
      logCronAlert({ component: "data-pipeline-cron", job: "catalog", error: msg });
    }
  }

  // 3. Update cursor
  const lastStoreId = stores[stores.length - 1].id;
  await supabase.from("system_config").update({ data_pipeline_cursor: lastStoreId }).neq("id", "none");

  // 4. Trigger next chunk if needed
  if (stores.length === CHUNK_SIZE) {
    console.log(`CHUNK_COMPLETED: Triggering next chunk after store ${lastStoreId}`);
    // Fire and forget call
    fetch(req.url, {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobs }),
    }).catch(err => console.error("Error triggering next chunk:", err));
  }

  const ok = Object.keys(jobErrors).length === 0;
  return new Response(
    JSON.stringify({ 
      ok, 
      processed_count: stores.length, 
      last_id: lastStoreId,
      has_more: stores.length === CHUNK_SIZE,
      jobs: out, 
      job_errors: ok ? undefined : jobErrors 
    }),
    { status: ok ? 200 : 500, headers: cors },
  );
});
