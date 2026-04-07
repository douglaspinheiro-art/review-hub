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
    enabled: !!userId,
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
        .order("reference_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FunnelMetricsV3;
    },
    enabled: !!storeId,
  });
}
