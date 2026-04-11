import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentUserAndStore } from "@/hooks/useDashboard";

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
        .select("*")
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
        .select("*")
        .eq("store_id", storeId)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

const PRESCRIPTIONS_PAGE_SIZE = 500;

export function usePrescriptionsV3(storeId?: string) {
  return useQuery({
    queryKey: ["prescriptions_v3", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*, opportunities(*)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(PRESCRIPTIONS_PAGE_SIZE);
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

export type PrescriptionStatusUpdate = {
  id: string;
  status: "aguardando_aprovacao" | "aprovada" | "em_execucao" | "concluida" | "rejeitada";
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

export function useProductsV3(storeId?: string, filter = "todos") {
  return useQuery({
    queryKey: ["products_v3", storeId, filter],
    queryFn: async () => {
      let query = supabase.from("products").select("*").eq("store_id", storeId);

      if (filter === "estoque_critico") query = query.lt("estoque", 5);
      if (filter === "baixa_cvr") query = query.lt("taxa_conversao_produto", 10);

      const { data, error } = await query.order("receita_30d", { ascending: false });
      if (error) throw error;
      return data as ProductRow[];
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
  return useQuery({
    queryKey: ["canais-page-data", user?.id],
    enabled: fetchEnabled && !!user?.id,
    queryFn: async (): Promise<CanaisPageData> => {
      const { storeId } = await getCurrentUserAndStore();
      if (!storeId) {
        return { storeId: null, channels: [], statsByChannelId: {} };
      }
      const since = new Date(Date.now() - CANAIS_ORDER_STATS_DAYS * 86_400_000).toISOString();
      const [chRes, ordRes] = await Promise.all([
        supabase.from("channels").select("*").eq("store_id", storeId).order("created_at", { ascending: false }),
        supabase.from("orders_v3").select("canal_id, valor").eq("store_id", storeId).gte("created_at", since),
      ]);
      if (chRes.error) throw chRes.error;
      if (ordRes.error) throw ordRes.error;
      const statsByChannelId: Record<string, { pedidos: number; receita: number }> = {};
      for (const row of ordRes.data ?? []) {
        const cid = row.canal_id;
        if (!cid) continue;
        if (!statsByChannelId[cid]) statsByChannelId[cid] = { pedidos: 0, receita: 0 };
        statsByChannelId[cid].pedidos += 1;
        statsByChannelId[cid].receita += Number(row.valor ?? 0);
      }
      return {
        storeId,
        channels: (chRes.data ?? []) as ChannelRow[],
        statsByChannelId,
      };
    },
    staleTime: 30_000,
  });
}

/** Logs de webhook visíveis pela RLS (`auth.uid() = user_id`) + nome da loja resolvido em `stores`. */
export function useWebhookLogs(fetchEnabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["webhook_logs", user?.id],
    enabled: fetchEnabled && !!user?.id,
    queryFn: async (): Promise<WebhookLogEnriched[]> => {
      const { data: logs, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (logs ?? []) as WebhookLogRow[];
      const ids = [...new Set(rows.map((r) => r.store_id).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: stores, error: se } = await supabase.from("stores").select("id, name").in("id", ids);
        if (!se && stores) {
          names = Object.fromEntries(stores.map((s) => [s.id, s.name ?? ""]));
        }
      }
      return rows.map((r) => ({
        ...r,
        store_name: r.store_id ? names[r.store_id] ?? null : null,
      }));
    },
    staleTime: 15_000,
  });
}

export function useMetricsV3(storeId?: string) {
  return useQuery({
    queryKey: ["funnel_metrics_v3", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_metrics_v3")
        .select("*")
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
