import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// --- Types ---
export interface StoreV3 {
  id: string;
  name: string;
  conversion_health_score: number;
  chs_history: any;
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

export function usePrescriptionsV3(storeId?: string) {
  return useQuery({
    queryKey: ["prescriptions_v3", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("*, opportunities(*)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

export function useProductsV3(storeId?: string, filter = "todos") {
  return useQuery({
    queryKey: ["products_v3", storeId, filter],
    queryFn: async () => {
      let query = supabase.from("products").select("*").eq("store_id", storeId);
      
      if (filter === "estoque_critico") query = query.lt("stock", 5);
      if (filter === "baixa_cvr") query = query.lt("product_conversion_rate", 10);

      const { data, error } = await query.order("revenue_30d", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

export function useWebhookLogs(userId?: string, isAdmin?: boolean) {
  return useQuery({
    queryKey: ["webhook_logs", userId, isAdmin],
    queryFn: async () => {
      const query = supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!isAdmin && userId) {
        query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin || !!userId,
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
        mobile_cvr: mobileVisitors > 0 ? (mobileOrders / mobileVisitors) * 100 : 0,
        desktop_cvr: desktopVisitors > 0 ? (desktopOrders / desktopVisitors) * 100 : 0,
      } satisfies FunnelMetricsV3;
    },
    enabled: !!storeId,
  });
}
