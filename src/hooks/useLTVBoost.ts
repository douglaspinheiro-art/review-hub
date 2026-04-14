import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import { logQueryTiming } from "@/lib/query-page-telemetry";
import {
  CHANNELS_LIST_SELECT,
  FUNNEL_METRICS_V3_SELECT,
  OPPORTUNITIES_LIST_SELECT,
  PRESCRIPTIONS_WITH_OPPORTUNITY_SELECT,
  STORE_V3_PUBLIC_SELECT,
  WEBHOOK_LOGS_LIST_SELECT,
} from "@/lib/supabase-select-fragments";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];

// --- Types ---
export interface StoreV3 {
  id: string;
  name: string;
  conversion_health_score: number;
  chs_history: Json | null;
  segment: string;
  pix_key: string;
  user_id: string;
}

export interface FunnelMetricsV3 {
  visitors: number;
  product_viewed: number;
  cart: number;
  checkout: number;
  order: number;
  mobile_visitors: number;
  mobile_orders: number;
  desktop_visitors: number;
  desktop_orders: number;
  mobile_cvr: number;
  desktop_cvr: number;
}

// --- Hooks ---

export function useStoreV3(storeId?: string) {
  return useQuery({
    queryKey: ["store_v3", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from("stores")
        .select(STORE_V3_PUBLIC_SELECT)
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data as unknown as StoreV3;
    },
    enabled: !!storeId,
  });
}

export function useOpportunitiesV3(storeId?: string) {
  return useQuery({
    queryKey: ["opportunities_v3", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(OPPORTUNITIES_LIST_SELECT)
        .eq("store_id", storeId)
        .order("detected_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

export type PrescriptionsQueryResult = {
  rows: any[];
  stats: {
    total_impact: number;
    pending_count: number;
    pending_value: number;
  };
};

import { invokeCachedRpc } from "@/lib/cached-rpc";

export function usePrescriptionsV3(storeId?: string) {
  return useQuery({
    queryKey: ["prescriptions_v3", storeId],
    queryFn: async (): Promise<PrescriptionsQueryResult> => {
      if (!storeId) return { rows: [], stats: { total_impact: 0, pending_count: 0, pending_value: 0 } };
      
      return invokeCachedRpc<PrescriptionsQueryResult>("get_prescriptions_bundle_v2", {
        p_store_id: storeId,
      });
    },
    enabled: !!storeId,
    refetchInterval: 60_000,
  });
}

export const VALID_PRESCRIPTION_STATUSES = [
  "aguardando_aprovacao",
  "aprovada",
  "em_execucao",
  "concluida",
  "rejeitada",
] as const;

export type PrescriptionStatusUpdate = {
  id: string;
  status: typeof VALID_PRESCRIPTION_STATUSES[number];
};

export function useUpdatePrescriptionStatus(storeId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: PrescriptionStatusUpdate) => {
      let q = supabase.from("prescriptions").update({ status }).eq("id", id);
      if (storeId) q = q.eq("store_id", storeId);
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      // Runtime guard: reject invalid status values before touching the cache
      if (!(VALID_PRESCRIPTION_STATUSES as readonly string[]).includes(status)) {
        throw new Error(`[useUpdatePrescriptionStatus] Invalid status value: "${status}"`);
      }
      await queryClient.cancelQueries({ queryKey: ["prescriptions_v3", storeId] });
      const prev = queryClient.getQueryData(["prescriptions_v3", storeId]);
      queryClient.setQueryData<Array<{ id: string; status?: string | null }>>(
        ["prescriptions_v3", storeId],
        (old) => Array.isArray(old) ? old.map(r => r.id === id ? { ...r, status } : r) : old,
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(["prescriptions_v3", storeId], context.prev);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prescriptions_v3", storeId] });
    },
  });
}

/** Agrega prescrições pendentes a partir do mesmo cache que `usePrescriptionsV3`. */
export function usePrescriptionsPendingStats(storeId?: string) {
  const q = usePrescriptionsV3(storeId);
  const { pendingCount, pendingValue } = useMemo(() => {
    const list = (q.data ?? []) as { status?: string | null; estimated_potential?: number | null }[];
    const pending = list.filter((p) => (p.status ?? "") === "aguardando_aprovacao");
    const pendingValue = pending.reduce((a, p) => a + Number(p.estimated_potential ?? 0), 0);
    return { pendingCount: pending.length, pendingValue };
  }, [q.data]);
  return { ...q, pendingCount, pendingValue };
}

const PRODUCT_LIST_COLUMNS =
  "id,store_id,user_id,nome,sku,preco,estoque,categoria,imagem_url,media_avaliacao,taxa_conversao_produto,receita_30d,num_visualizacoes,num_vendas,num_adicionados_carrinho,num_avaliacoes,produto_externo_id,created_at,updated_at";

export type UseProductsV3Options = {
  filter?: string;
  page?: number;
  pageSize?: number;
  /** Mínimo 2 caracteres para filtrar no servidor (ilike nome/sku). */
  search?: string;
};

export type ProductsV3Page = { rows: ProductRow[]; total: number };

function normalizeProductsV3Options(optionsOrFilter?: string | UseProductsV3Options): Required<UseProductsV3Options> {
  if (typeof optionsOrFilter === "string" || optionsOrFilter == null) {
    return {
      filter: typeof optionsOrFilter === "string" ? optionsOrFilter : "todos",
      page: 0,
      pageSize: 10, // Ponto #3: Reduzido de 60 para 10
      search: "",
    };
  }
  return {
    filter: optionsOrFilter.filter ?? "todos",
    page: optionsOrFilter.page ?? 0,
    pageSize: Math.min(100, Math.max(4, optionsOrFilter.pageSize ?? 10)), // Ponto #3: Máximo reduzido para 100 e default para 10
    search: (optionsOrFilter.search ?? "").trim(),
  };
}

/**
 * Lista paginada de produtos (sem `select('*')`). O 2º argumento pode ser `filter` string (legado) ou opções.
 */
export function useProductsV3(storeId?: string, optionsOrFilter?: string | UseProductsV3Options) {
  const o = normalizeProductsV3Options(optionsOrFilter);
  return useQuery({
    queryKey: ["products_v3", storeId, o.filter, o.page, o.pageSize, o.search],
    queryFn: async (): Promise<ProductsV3Page> => {
      const t0 = performance.now();
      let query = supabase
        .from("products")
        .select(PRODUCT_LIST_COLUMNS, { count: "exact" })
        .eq("store_id", storeId as string);

      if (o.filter === "estoque_critico") query = query.lt("estoque", 5);
      if (o.filter === "baixa_cvr") query = query.lt("taxa_conversao_produto", 10);
      if (o.search.length >= 2) {
        const esc = o.search.replace(/%/g, "\\%").replace(/_/g, "\\_");
        query = query.or(`nome.ilike.%${esc}%,sku.ilike.%${esc}%`);
      }
      const from = o.page * o.pageSize;
      const to = from + o.pageSize - 1;
      const { data, error, count } = await query.order("receita_30d", { ascending: false }).range(from, to);
      if (error) throw error;
      logQueryTiming("products_v3", t0);
      return { rows: (data ?? []) as ProductRow[], total: count ?? 0 };
    },
    enabled: !!storeId,
  });
}

export type ChannelRow = Database["public"]["Tables"]["channels"]["Row"];

export type WebhookLogRow = Database["public"]["Tables"]["webhook_logs"]["Row"];

export type WebhookLogEnriched = WebhookLogRow & { store_name: string | null };

const CANAIS_ORDER_STATS_DAYS = 90;

export type CanaisPageData = {
  storeId: string | null;
  channels: ChannelRow[];
  statsByChannelId: Record<string, { pedidos: number; receita: number }>;
};

/** Canais da loja atual + agregação de pedidos (`orders_v3`) por `canal_id` nos últimos 90 dias. */
export function useCanaisPageData(fetchEnabled: boolean) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  return useQuery({
    queryKey: ["canais-page-data", user?.id, scope?.activeStoreId ?? null],
    enabled: fetchEnabled && !!user?.id && scope?.ready === true,
    queryFn: async (): Promise<CanaisPageData> => {
      const t0 = performance.now();
      const storeId = scope?.activeStoreId ?? null;
      if (!storeId) {
        return { storeId: null, channels: [], statsByChannelId: {} };
      }
      const since = new Date(Date.now() - CANAIS_ORDER_STATS_DAYS * 86_400_000).toISOString();
      const chRes = await supabase
        .from("channels")
        .select(CHANNELS_LIST_SELECT)
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (chRes.error) throw chRes.error;

      const statsByChannelId: Record<string, { pedidos: number; receita: number }> = {};
      const rpc = await supabase.rpc("get_channel_order_stats", {
        p_store_id: storeId,
        p_since: since,
      });
      if (!rpc.error && Array.isArray(rpc.data)) {
        for (const row of rpc.data) {
          if (!row.canal_id) continue;
          statsByChannelId[row.canal_id] = {
            pedidos: Number(row.pedidos ?? 0),
            receita: Number(row.receita ?? 0),
          };
        }
      } else {
        const ordRes = await supabase
          .from("orders_v3")
          .select("canal_id, valor")
          .eq("store_id", storeId)
          .gte("created_at", since)
          .limit(5000);
        if (ordRes.error) throw ordRes.error;
        for (const row of ordRes.data ?? []) {
          const cid = row.canal_id;
          if (!cid) continue;
          if (!statsByChannelId[cid]) statsByChannelId[cid] = { pedidos: 0, receita: 0 };
          statsByChannelId[cid].pedidos += 1;
          statsByChannelId[cid].receita += Number(row.valor ?? 0);
        }
      }
      logQueryTiming("canais-page-data", t0);
      return {
        storeId,
        channels: (chRes.data ?? []) as ChannelRow[],
        statsByChannelId,
      };
    },
    staleTime: 30_000,
  });
}

export type WebhookLogsQueryResult = {
  logs: WebhookLogEnriched[];
  totalCount: number;
  page: number;
  pageSize: number;
};

/** Logs de webhook visíveis pela RLS (`auth.uid() = user_id`) + nome da loja resolvido em `stores`. */
export function useWebhookLogs(
  fetchEnabled = true,
  opts?: { page?: number; pageSize?: number },
) {
  const { user } = useAuth();
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, opts?.pageSize ?? 50));
  return useQuery({
    queryKey: ["webhook_logs", user?.id, page, pageSize],
    enabled: fetchEnabled && !!user?.id,
    queryFn: async (): Promise<WebhookLogsQueryResult> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data: logs, error } = await supabase
        .from("webhook_logs")
        .select(WEBHOOK_LOGS_LIST_SELECT)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      const { count, error: countErr } = await supabase
        .from("webhook_logs")
        .select("id", { count: "exact", head: true });
      if (countErr) throw countErr;
      const rows = (logs ?? []) as WebhookLogRow[];
      const ids = [...new Set(rows.map((r) => r.store_id).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: stores, error: se } = await supabase.from("stores").select("id, name").in("id", ids);
        if (!se && stores) {
          names = Object.fromEntries(stores.map((s) => [s.id, s.name ?? ""]));
        }
      }
      const enriched = rows.map((r) => ({
        ...r,
        store_name: r.store_id ? names[r.store_id] ?? null : null,
      }));
      return {
        logs: enriched,
        totalCount: count ?? 0,
        page,
        pageSize,
      };
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useMetricsV3(storeId?: string) {
  return useQuery({
    queryKey: ["funnel_metrics_v3", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_metrics_v3")
        .select(FUNNEL_METRICS_V3_SELECT)
        .eq("store_id", storeId)
        .order("data_referencia", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as {
        visitantes?: number | null;
        produto_visto?: number | null;
        carrinho?: number | null;
        checkout?: number | null;
        pedido?: number | null;
        visitantes_mobile?: number | null;
        pedidos_mobile?: number | null;
        visitantes_desktop?: number | null;
        pedidos_desktop?: number | null;
      };
      const mobileVisitors = Number(row.visitantes_mobile ?? 0);
      const mobileOrders = Number(row.pedidos_mobile ?? 0);
      const desktopVisitors = Number(row.visitantes_desktop ?? 0);
      const desktopOrders = Number(row.pedidos_desktop ?? 0);

      return {
        visitors: Number(row.visitantes ?? 0),
        product_viewed: Number(row.produto_visto ?? 0),
        cart: Number(row.carrinho ?? 0),
        checkout: Number(row.checkout ?? 0),
        order: Number(row.pedido ?? 0),
        mobile_visitors: mobileVisitors,
        mobile_orders: mobileOrders,
        desktop_visitors: desktopVisitors,
        desktop_orders: desktopOrders,
        mobile_cvr: mobileVisitors > 0 ? (mobileOrders / mobileVisitors) * 100 : 0,
        desktop_cvr: desktopVisitors > 0 ? (desktopOrders / desktopVisitors) * 100 : 0,
      } satisfies FunnelMetricsV3;
    },
    enabled: !!storeId,
  });
}
