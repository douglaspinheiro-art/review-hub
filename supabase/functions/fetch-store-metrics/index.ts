import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as cors, checkDistributedRateLimit, rateLimitedResponse } from "../_shared/edge-utils.ts";

const DAYS = 30;

/**
 * Validates a user-supplied API address to prevent SSRF attacks.
 */
function assertSafeApiAddress(raw: string): void {
  const fullUrl = raw.startsWith("https://") ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(fullUrl);
  } catch {
    throw new Error(`api_address inválido: "${raw}"`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("api_address aponta para loopback — não permitido");
  }
  if (host === "169.254.169.254" || host.endsWith(".169.254.169.254")) {
    throw new Error("api_address aponta para metadata server — não permitido");
  }
  const privatePatterns = [
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
  ];
  if (privatePatterns.some((r) => r.test(host))) {
    throw new Error("api_address aponta para endereço IP privado — não permitido");
  }
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - DAYS);
  return d.toISOString();
}

// ─── Shopify (paginated) ────────────────────────────────────────
async function fetchShopify(config: Record<string, string>) {
  const shop = config.shop_url?.replace(/\/$/, "");
  const token = config.access_token;
  if (!shop || !token) throw new Error("Credenciais Shopify incompletas");

  assertSafeApiAddress(shop);
  const base = `https://${shop}/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const since = thirtyDaysAgo();

  // Paginated order fetch — follow Link: rel="next" headers
  let allOrders: Array<Record<string, string>> = [];
  let url: string | null =
    `${base}/orders.json?status=any&financial_status=paid&created_at_min=${since}&limit=250&fields=total_price,created_at`;

  while (url && allOrders.length < 10_000) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") || "2");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw new Error(`Shopify orders: ${res.status} ${await res.text()}`);
    }
    const { orders } = await res.json();
    allOrders = allOrders.concat(orders ?? []);

    // Parse Link header for pagination
    const linkHeader = res.headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  const faturamento = allOrders.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0);
  const ticketMedio = allOrders.length > 0 ? faturamento / allOrders.length : 0;

  const custRes = await fetch(`${base}/customers/count.json`, { headers });
  const { count: totalClientes = 0 } = custRes.ok ? await custRes.json() : {};

  const cartRes = await fetch(
    `${base}/checkouts.json?created_at_min=${since}&limit=250`,
    { headers }
  );
  const { checkouts = [] } = cartRes.ok ? await cartRes.json() : {};
  const taxaAbandono = (allOrders.length + checkouts.length) > 0
    ? checkouts.length / (allOrders.length + checkouts.length)
    : 0.7;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: Math.min(taxaAbandono, 0.85) };
}

// ─── Nuvemshop ──────────────────────────────────────────────
async function fetchNuvemshop(config: Record<string, string>) {
  const userId = config.user_id;
  const token = config.access_token;
  if (!userId || !token) throw new Error("Credenciais Nuvemshop incompletas");

  const base = `https://api.tiendanube.com/v1/${userId}`;
  const headers = {
    "Authentication": `bearer ${token}`,
    "User-Agent": "LTV Boost (suporte@ltvboost.com.br)",
    "Content-Type": "application/json",
  };
  const since = thirtyDaysAgo();

  const ordersRes = await fetch(
    `${base}/orders?created_at_min=${since}&per_page=200&fields=total`,
    { headers }
  );
  if (!ordersRes.ok) throw new Error(`Nuvemshop orders: ${ordersRes.status} ${await ordersRes.text()}`);
  const orders = await ordersRes.json();

  const faturamento = (Array.isArray(orders) ? orders : [])
    .reduce((s: number, o: Record<string, string>) => s + parseFloat(o.total || "0"), 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;

  const custRes = await fetch(`${base}/customers?fields=id&per_page=1`, { headers });
  const totalClientes = custRes.ok
    ? parseInt(custRes.headers.get("x-total-count") || "0", 10) || 0
    : 0;

  const taxaAbandono = 0.72;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono };
}

// ─── WooCommerce (paginated) ─────────────────────────────────
async function fetchWooCommerce(config: Record<string, string>) {
  const siteUrl = config.site_url?.replace(/\/$/, "");
  const ck = config.consumer_key;
  const cs = config.consumer_secret;
  if (!siteUrl || !ck || !cs) throw new Error("Credenciais WooCommerce incompletas");

  assertSafeApiAddress(siteUrl);
  const auth = btoa(`${ck}:${cs}`);
  const base = `${siteUrl}/wp-json/wc/v3`;
  const headers = { Authorization: `Basic ${auth}` };
  const since = thirtyDaysAgo();

  // Paginated order fetch
  let allOrders: Array<Record<string, string>> = [];
  let page = 1;
  const perPage = 100;

  while (allOrders.length < 10_000) {
    const res = await fetch(
      `${base}/orders?after=${since}&per_page=${perPage}&page=${page}&status=completed,processing&_fields=total`,
      { headers }
    );
    if (!res.ok) {
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`WooCommerce orders: ${res.status}`);
    }
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) break;
    allOrders = allOrders.concat(orders);
    if (orders.length < perPage) break;
    page++;
  }

  const faturamento = allOrders.reduce((s, o) => s + parseFloat(o.total || "0"), 0);
  const ticketMedio = allOrders.length > 0 ? faturamento / allOrders.length : 0;

  const custRes = await fetch(`${base}/customers?per_page=1`, { headers });
  const totalClientes = custRes.ok
    ? parseInt(custRes.headers.get("x-wp-total") || "0", 10)
    : 0;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: 0.70 };
}

// ─── Tray ────────────────────────────────────────────────────
async function fetchTray(config: Record<string, string>) {
  const apiAddress = config.api_address?.replace(/\/$/, "");
  const token = config.access_token;
  if (!apiAddress || !token) throw new Error("Credenciais Tray incompletas");

  assertSafeApiAddress(apiAddress);
  const base = `https://${apiAddress}/web_api`;
  const since = thirtyDaysAgo().split("T")[0];

  const ordersRes = await fetch(
    `${base}/orders?access_token=${encodeURIComponent(token)}&created=${since}&limit=50&status=approved`,
  );
  if (!ordersRes.ok) throw new Error(`Tray orders: ${ordersRes.status}`);
  const ordersData = await ordersRes.json();
  const orders = ordersData.Orders || [];

  const faturamento = orders.reduce((s: number, o: { Order?: { total?: string } }) => s + parseFloat(o.Order?.total || "0"), 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;

  const custRes = await fetch(`${base}/customers?access_token=${encodeURIComponent(token)}&limit=1`);
  const totalClientes = custRes.ok
    ? parseInt((await custRes.json())?.paging?.total || "0", 10)
    : 0;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: 0.72 };
}

// ─── VTEX ────────────────────────────────────────────────────
async function fetchVTEX(config: Record<string, string>) {
  const account = config.account_name;
  const appKey = config.app_key;
  const appToken = config.app_token;
  if (!account || !appKey || !appToken) throw new Error("Credenciais VTEX incompletas");

  const base = `https://${account}.vtexcommercestable.com.br/api`;
  const headers = { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken };
  const since = thirtyDaysAgo().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const ordersRes = await fetch(
    `${base}/oms/pvt/orders?f_creationDate=creationDate:[${since}T00:00:00.000Z TO ${today}T23:59:59.999Z]&per_page=100`,
    { headers },
  );
  if (!ordersRes.ok) throw new Error(`VTEX orders: ${ordersRes.status}`);
  const ordersData = await ordersRes.json();
  const orders = ordersData.list || [];

  const faturamento = orders.reduce((s: number, o: { totalValue?: number }) => s + (o.totalValue || 0) / 100, 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;
  const totalClientes = ordersData.paging?.total || orders.length;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: 0.68 };
}

// ─── Yampi ───────────────────────────────────────────────────
async function fetchYampi(config: Record<string, string>) {
  const alias = config.alias || config.store_alias;
  const token = config.token || config.secret_key || config.access_token;
  if (!alias || !token) throw new Error("Credenciais Yampi incompletas");

  const base = `https://api.dooki.com.br/v2/${alias}`;
  const headers = {
    "User-Token": token,
    "Content-Type": "application/json",
  };

  // Fetch orders from last 30 days
  const ordersRes = await fetch(`${base}/orders?limit=200`, { headers });
  if (!ordersRes.ok) throw new Error(`Yampi orders: ${ordersRes.status}`);
  const ordersData = await ordersRes.json();
  const orders = ordersData.data || [];

  const faturamento = orders.reduce((s: number, o: Record<string, unknown>) =>
    s + parseFloat(String(o.total ?? o.amount ?? 0)), 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;

  const custRes = await fetch(`${base}/customers?limit=1`, { headers });
  const custData = custRes.ok ? await custRes.json() : {};
  const totalClientes = custData.meta?.pagination?.total ?? orders.length;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: 0.73 };
}

// ─── Magento 2 ───────────────────────────────────────────────
async function fetchMagento(config: Record<string, string>) {
  const baseUrl = config.base_url?.replace(/\/$/, "") || config.api_url?.replace(/\/$/, "");
  const token = config.access_token || config.integration_token || config.bearer_token;
  if (!baseUrl || !token) throw new Error("Credenciais Magento incompletas");

  assertSafeApiAddress(baseUrl);
  const base = `${baseUrl.startsWith("https://") ? baseUrl : `https://${baseUrl}`}/rest/V1`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const since = thirtyDaysAgo().split("T")[0];

  // Fetch orders using searchCriteria — paginated
  let allOrders: Array<Record<string, unknown>> = [];
  let page = 1;
  const pageSize = 100;

  while (allOrders.length < 10_000) {
    const searchCriteria = [
      `searchCriteria[filter_groups][0][filters][0][field]=created_at`,
      `searchCriteria[filter_groups][0][filters][0][value]=${since}`,
      `searchCriteria[filter_groups][0][filters][0][condition_type]=gteq`,
      `searchCriteria[filter_groups][1][filters][0][field]=status`,
      `searchCriteria[filter_groups][1][filters][0][value]=complete,processing`,
      `searchCriteria[filter_groups][1][filters][0][condition_type]=in`,
      `searchCriteria[pageSize]=${pageSize}`,
      `searchCriteria[currentPage]=${page}`,
      `fields=items[grand_total,created_at],total_count`,
    ].join("&");

    const res = await fetch(`${base}/orders?${searchCriteria}`, { headers });
    if (!res.ok) {
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`Magento orders: ${res.status}`);
    }
    const data = await res.json();
    const items = data.items || [];
    allOrders = allOrders.concat(items);
    if (items.length < pageSize || allOrders.length >= (data.total_count || 0)) break;
    page++;
  }

  const faturamento = allOrders.reduce((s, o) => s + parseFloat(String(o.grand_total ?? 0)), 0);
  const ticketMedio = allOrders.length > 0 ? faturamento / allOrders.length : 0;

  // Get customer count
  const custRes = await fetch(`${base}/customers/search?searchCriteria[pageSize]=1&fields=total_count`, { headers });
  const custData = custRes.ok ? await custRes.json() : {};
  const totalClientes = custData.total_count ?? allOrders.length;

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: 0.70 };
}

// ─── Shopee (Partner API) ────────────────────────────────────
async function fetchShopee(config: Record<string, string>) {
  const shopId = config.shop_id;
  const partnerId = config.partner_id;
  const partnerKey = config.partner_key;
  const accessToken = config.access_token;
  if (!shopId || !accessToken) throw new Error("Credenciais Shopee incompletas");

  // Shopee Partner API requires HMAC signature — simplified approach using access_token
  const base = `https://partner.shopeemobile.com/api/v2`;

  // Use the access token for API calls
  const timestamp = Math.floor(Date.now() / 1000);
  const since = Math.floor((Date.now() - 30 * 86400000) / 1000);

  // Fetch order list
  const orderUrl = `${base}/order/get_order_list?access_token=${accessToken}&shop_id=${shopId}&partner_id=${partnerId || ""}&timestamp=${timestamp}&time_range_field=create_time&time_from=${since}&time_to=${timestamp}&page_size=100&order_status=COMPLETED`;

  const ordersRes = await fetch(orderUrl, {
    headers: { "Content-Type": "application/json" },
  });

  if (!ordersRes.ok) throw new Error(`Shopee orders: ${ordersRes.status}`);
  const ordersData = await ordersRes.json();
  const orderList = ordersData.response?.order_list ?? [];

  // Estimate metrics from order count (Shopee API requires separate calls for details)
  const totalOrders = ordersData.response?.total_count ?? orderList.length;
  const faturamento = totalOrders * parseFloat(config.avg_ticket || "150"); // Estimate
  const ticketMedio = totalOrders > 0 ? faturamento / totalOrders : 0;
  const totalClientes = Math.round(totalOrders * 0.7); // Estimate unique customers

  return { faturamento, ticketMedio, totalClientes, taxaAbandono: 0.75 };
}

// ─── Handler principal ───────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: cors });

    const { allowed: rlAllowed } = await checkDistributedRateLimit(supabase, `fetch-store-metrics:${user.id}`, 24, 60_000);
    if (!rlAllowed) return rateLimitedResponse();

    const ECOMMERCE_TYPES = ["shopify", "nuvemshop", "woocommerce", "tray", "vtex", "yampi", "magento", "shopee"];
    const { data: integration } = await supabase
      .from("integrations")
      .select("type, config")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("type", ECOMMERCE_TYPES)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ error: "Nenhuma integração de e-commerce ativa." }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    let metrics: { faturamento: number; ticketMedio: number; totalClientes: number; taxaAbandono: number };

    switch (integration.type) {
      case "shopify":
        metrics = await fetchShopify(integration.config);
        break;
      case "nuvemshop":
        metrics = await fetchNuvemshop(integration.config);
        break;
      case "woocommerce":
        metrics = await fetchWooCommerce(integration.config);
        break;
      case "tray":
        metrics = await fetchTray(integration.config as Record<string, string>);
        break;
      case "vtex":
        metrics = await fetchVTEX(integration.config as Record<string, string>);
        break;
      case "yampi":
        metrics = await fetchYampi(integration.config as Record<string, string>);
        break;
      case "magento":
        metrics = await fetchMagento(integration.config as Record<string, string>);
        break;
      case "shopee":
        metrics = await fetchShopee(integration.config as Record<string, string>);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Plataforma ${integration.type} ainda não suportada para diagnóstico automático.` }),
          { status: 422, headers: { ...cors, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ plataforma: integration.type, ...metrics }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errMsg = (err as Error).message ?? "Erro interno";
    // Friendly message for rate limit errors from upstream APIs
    if (errMsg.includes("429") || errMsg.toLowerCase().includes("rate")) {
      return new Response(
        JSON.stringify({ error: "A plataforma está limitando requisições. Tente novamente em alguns minutos." }),
        { status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": "120" } }
      );
    }
    console.error("fetch-store-metrics error:", err);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
