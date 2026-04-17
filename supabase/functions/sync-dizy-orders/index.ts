// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

interface DizyOrder {
  entity_id: number | string;
  increment_id: string;
  created_at: string;
  status: string;
  state?: string;
  grand_total: number;
  discount_amount?: number;
  shipping_amount?: number;
  customer_email?: string;
  customer_firstname?: string;
  customer_lastname?: string;
  billing_address?: { telephone?: string };
  payment?: { method?: string };
  items?: Array<{ sku: string; name: string; qty_ordered: number; price: number }>;
}

async function fetchDizyOrders(
  baseUrl: string,
  token: string,
  sinceIso: string,
  pageSize = 100,
): Promise<DizyOrder[]> {
  // Magento REST: paginated. Loop until fewer than pageSize results come back.
  // Hard ceiling of 100 pages (= 10k orders) prevents runaway loops if the cursor is broken.
  const MAX_PAGES = 100;
  const all: DizyOrder[] = [];
  for (let currentPage = 1; currentPage <= MAX_PAGES; currentPage++) {
    const params = new URLSearchParams();
    params.set("searchCriteria[filter_groups][0][filters][0][field]", "created_at");
    params.set("searchCriteria[filter_groups][0][filters][0][value]", sinceIso);
    params.set("searchCriteria[filter_groups][0][filters][0][condition_type]", "gt");
    params.set("searchCriteria[sortOrders][0][field]", "created_at");
    params.set("searchCriteria[sortOrders][0][direction]", "ASC");
    params.set("searchCriteria[pageSize]", String(pageSize));
    params.set("searchCriteria[currentPage]", String(currentPage));

    const url = `${baseUrl.replace(/\/$/, "")}/rest/V1/orders?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Dizy API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    const items = (data.items ?? []) as DizyOrder[];
    all.push(...items);
    if (items.length < pageSize) break; // last page
  }
  return all;
}

function normalizePhone(raw: string | undefined, countryDial = "55"): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 12) return digits;             // already has country code
  return `${countryDial}${digits}`;
}

async function syncStore(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  userId: string,
  options: { backfillDays?: number },
) {
  // 1. Buscar credenciais Dizy do channel desta loja + country code
  const [channelRes, storeRes] = await Promise.all([
    supabase
      .from("channels")
      .select("credenciais_json")
      .eq("store_id", storeId)
      .eq("plataforma", "Dizy Commerce")
      .eq("ativo", true)
      .maybeSingle(),
    supabase.from("stores").select("country_code").eq("id", storeId).maybeSingle(),
  ]);
  if (channelRes.error) throw new Error(`channel query: ${channelRes.error.message}`);
  if (!channelRes.data) throw new Error("Dizy channel not configured for this store");

  const creds = channelRes.data.credenciais_json as { base_url?: string; token?: string; api_key?: string } | null;
  const apiToken = creds?.token ?? creds?.api_key;
  if (!creds?.base_url || !apiToken) {
    throw new Error("Dizy credentials incomplete (base_url + token/api_key required)");
  }

  // ISO 3166-1 alpha-2 → dial code (digits, no `+`). Defaults to BR.
  const countryDialMap: Record<string, string> = {
    BR: "55", PT: "351", AR: "54", UY: "598", MX: "52", CL: "56",
    CO: "57", PE: "51", PY: "595", US: "1", ES: "34",
  };
  const cc = ((storeRes.data as { country_code?: string } | null)?.country_code ?? "BR").toUpperCase();
  const countryDial = countryDialMap[cc] ?? "55";

  // 2. Determinar cursor (último created_at) ou backfill
  const { data: state } = await supabase
    .from("dizy_sync_state")
    .select("last_synced_at, backfill_completed_at")
    .eq("store_id", storeId)
    .maybeSingle();

  let sinceIso: string;
  const now = new Date();
  if (options.backfillDays && !state?.backfill_completed_at) {
    const since = new Date(now.getTime() - options.backfillDays * 86_400_000);
    sinceIso = since.toISOString().slice(0, 19).replace("T", " ");
  } else if (state?.last_synced_at) {
    sinceIso = new Date(state.last_synced_at).toISOString().slice(0, 19).replace("T", " ");
  } else {
    // Primeira execução incremental — últimas 24h
    sinceIso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  }

  // 3. Marcar como running
  await supabase.from("dizy_sync_state").upsert({
    store_id: storeId,
    user_id: userId,
    last_run_status: "running",
    last_run_at: new Date().toISOString(),
    last_run_error: null,
  }, { onConflict: "store_id" });

  // 4. Buscar pedidos
  const orders = await fetchDizyOrders(creds.base_url, apiToken, sinceIso);
  let importedOrders = 0;
  let importedCustomers = 0;
  let lastCreatedAt: string | null = null;
  let lastExternalId: string | null = null;

  for (const order of orders) {
    const phone = normalizePhone(order.billing_address?.telephone, countryDial);
    if (!phone) continue; // Pedido sem telefone não entra no CRM

    const name = [order.customer_firstname, order.customer_lastname].filter(Boolean).join(" ") || null;

    const { data: result, error: upsertErr } = await supabase.rpc("upsert_order_with_customer", {
      p_user_id: userId,
      p_store_id: storeId,
      p_phone: phone,
      p_email: order.customer_email ?? null,
      p_name: name,
      p_pedido_externo_id: String(order.increment_id ?? order.entity_id),
      p_source: "dizy",
      p_valor: Number(order.grand_total ?? 0),
      p_valor_desconto: Number(order.discount_amount ?? 0),
      p_valor_frete: Number(order.shipping_amount ?? 0),
      p_status: order.status ?? "unknown",
      p_financial_status: order.state ?? null,
      p_fulfillment_status: null,
      p_payment_method: order.payment?.method ?? null,
      p_produtos_json: order.items ?? null,
      p_created_at: order.created_at,
    });

    if (upsertErr) {
      console.error(`[dizy-sync] upsert failed for ${order.increment_id}:`, upsertErr.message);
      continue;
    }
    if ((result as any)?.is_new_order) importedOrders++;
    importedCustomers++; // upsert sempre toca customer
    lastCreatedAt = order.created_at;
    lastExternalId = String(order.increment_id ?? order.entity_id);
  }

  // 5. Atualizar state
  const isBackfill = Boolean(options.backfillDays && !state?.backfill_completed_at);
  await supabase.from("dizy_sync_state").upsert({
    store_id: storeId,
    user_id: userId,
    last_run_status: "ok",
    last_run_at: new Date().toISOString(),
    last_synced_at: lastCreatedAt
      ? new Date(lastCreatedAt).toISOString()
      : (state?.last_synced_at ?? new Date().toISOString()),
    last_order_external_id: lastExternalId ?? state?.last_synced_at ?? null,
    orders_imported_total: (state as any)?.orders_imported_total
      ? ((state as any).orders_imported_total as number) + importedOrders
      : importedOrders,
    customers_imported_total: (state as any)?.customers_imported_total
      ? ((state as any).customers_imported_total as number) + importedCustomers
      : importedCustomers,
    backfill_completed_at: isBackfill ? new Date().toISOString() : state?.backfill_completed_at ?? null,
  }, { onConflict: "store_id" });

  return { storeId, fetched: orders.length, importedOrders, importedCustomers };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const isCron = req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
    const backfillParam = url.searchParams.get("backfill");
    const backfillDays = backfillParam ? Math.min(90, Math.max(1, parseInt(backfillParam))) : undefined;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Modo CRON: itera todas as lojas com canal Dizy ativo
    if (isCron) {
      const { data: channels, error } = await supabase
        .from("channels")
        .select("store_id, user_id")
        .eq("plataforma", "Dizy Commerce")
        .eq("ativo", true);
      if (error) throw error;

      const results: any[] = [];
      for (const ch of channels ?? []) {
        if (!ch.store_id || !ch.user_id) continue;
        try {
          const r = await syncStore(supabase, ch.store_id, ch.user_id, {});
          results.push(r);
        } catch (e) {
          await supabase.from("dizy_sync_state").upsert({
            store_id: ch.store_id,
            user_id: ch.user_id,
            last_run_status: "error",
            last_run_error: (e as Error).message,
            last_run_at: new Date().toISOString(),
          }, { onConflict: "store_id" });
          results.push({ storeId: ch.store_id, error: (e as Error).message });
        }
      }
      return new Response(JSON.stringify({ ok: true, mode: "cron", results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo USER: requer JWT + store_id no body (backfill manual)
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const storeId = body.store_id as string | undefined;
    if (!storeId) {
      return new Response(JSON.stringify({ error: "store_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar ownership da loja via RPC (usa user_client com JWT do user)
    const { error: assertErr } = await userClient.rpc("assert_store_access", { p_store_id: storeId });
    if (assertErr) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await syncStore(supabase, storeId, userData.user.id, { backfillDays });
    return new Response(JSON.stringify({ ok: true, mode: "manual", ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[sync-dizy-orders] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
