import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as cors, checkDistributedRateLimit, rateLimitedResponse } from "../_shared/edge-utils.ts";

const DAYS = 30;

/**
 * Validates a user-supplied API address to prevent SSRF attacks.
 * Rejects hostnames/IPs that resolve to private, loopback, or link-local ranges.
 * Only HTTPS addresses with public-looking hostnames are accepted.
 */
function assertSafeApiAddress(raw: string): void {
  // Construct a full URL so we can inspect the hostname
  const fullUrl = raw.startsWith("https://") ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(fullUrl);
  } catch {
    throw new Error(`api_address inválido: "${raw}"`);
  }
  const host = parsed.hostname.toLowerCase();
  // Reject loopback
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("api_address aponta para loopback — não permitido");
  }
  // Reject link-local / metadata endpoints
  if (host === "169.254.169.254" || host.endsWith(".169.254.169.254")) {
    throw new Error("api_address aponta para metadata server — não permitido");
  }
  // Reject RFC-1918 private ranges (simple string prefix check)
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

// ─── Shopify ────────────────────────────────────────────────
async function fetchShopify(config: Record<string, string>) {
  const shop = config.shop_url?.replace(/\/$/, "");
  const token = config.access_token;
  if (!shop || !token) throw new Error("Credenciais Shopify incompletas");

  // SSRF guard: shop_url is user-controlled — validate before fetching.
  assertSafeApiAddress(shop);
  const base = `https://${shop}/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  const since = thirtyDaysAgo();

  // Pedidos últimos 30 dias (paginado até 250)
  const ordersRes = await fetch(
    `${base}/orders.json?status=any&financial_status=paid&created_at_min=${since}&limit=250&fields=total_price,created_at`,
    { headers }
  );
  if (!ordersRes.ok) throw new Error(`Shopify orders: ${ordersRes.status} ${await ordersRes.text()}`);
  const { orders } = await ordersRes.json();

  const faturamento = orders.reduce((s: number, o: Record<string, string>) => s + parseFloat(o.total_price || "0"), 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;

  // Total de clientes
  const custRes = await fetch(`${base}/customers/count.json`, { headers });
  const { count: totalClientes = 0 } = custRes.ok ? await custRes.json() : {};

  // Carrinhos abandonados últimos 30 dias
  const cartRes = await fetch(
    `${base}/checkouts.json?created_at_min=${since}&limit=250`,
    { headers }
  );
  const { checkouts = [] } = cartRes.ok ? await cartRes.json() : {};
  const taxaAbandono = (orders.length + checkouts.length) > 0
    ? checkouts.length / (orders.length + checkouts.length)
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

  // Pedidos últimos 30 dias
  const ordersRes = await fetch(
    `${base}/orders?created_at_min=${since}&per_page=200&fields=total`,
    { headers }
  );
  if (!ordersRes.ok) throw new Error(`Nuvemshop orders: ${ordersRes.status} ${await ordersRes.text()}`);
  const orders = await ordersRes.json();

  const faturamento = (Array.isArray(orders) ? orders : [])
    .reduce((s: number, o: Record<string, string>) => s + parseFloat(o.total || "0"), 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;

  // Total de clientes
  const custRes = await fetch(`${base}/customers?fields=id&per_page=1`, { headers });
  const totalClientes = custRes.ok
    ? parseInt(custRes.headers.get("x-total-count") || "0", 10) || 0
    : 0;

  // Carrinhos abandonados (estimativa via média do segmento se não disponível)
  const taxaAbandono = 0.72; // Nuvemshop não expõe abandoned checkouts na REST API pública

  return { faturamento, ticketMedio, totalClientes, taxaAbandono };
}

// ─── WooCommerce ─────────────────────────────────────────────
async function fetchWooCommerce(config: Record<string, string>) {
  const siteUrl = config.site_url?.replace(/\/$/, "");
  const ck = config.consumer_key;
  const cs = config.consumer_secret;
  if (!siteUrl || !ck || !cs) throw new Error("Credenciais WooCommerce incompletas");

  // SSRF guard: site_url is user-controlled — validate before fetching.
  assertSafeApiAddress(siteUrl);
  const auth = btoa(`${ck}:${cs}`);
  const base = `${siteUrl}/wp-json/wc/v3`;
  const headers = { Authorization: `Basic ${auth}` };
  const since = thirtyDaysAgo();

  const ordersRes = await fetch(
    `${base}/orders?after=${since}&per_page=100&status=completed,processing&_fields=total`,
    { headers }
  );
  if (!ordersRes.ok) throw new Error(`WooCommerce orders: ${ordersRes.status}`);
  const orders = await ordersRes.json();

  const faturamento = (Array.isArray(orders) ? orders : [])
    .reduce((s: number, o: Record<string, string>) => s + parseFloat(o.total || "0"), 0);
  const ticketMedio = orders.length > 0 ? faturamento / orders.length : 0;

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
  const since = thirtyDaysAgo().split("T")[0]; // yyyy-mm-dd

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
  const since = thirtyDaysAgo().toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  // OMS List orders
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

// ─── Handler principal ───────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Autentica usuário
    const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: cors });

    const { allowed: rlAllowed } = await checkDistributedRateLimit(supabase, `fetch-store-metrics:${user.id}`, 24, 60_000);
    if (!rlAllowed) return rateLimitedResponse();

    // Busca integração ativa de e-commerce
    const ECOMMERCE_TYPES = ["shopify", "nuvemshop", "woocommerce", "tray", "vtex"];
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
    console.error("fetch-store-metrics error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Erro interno" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
