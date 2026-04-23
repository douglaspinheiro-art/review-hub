import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type LtvCohort = {
  cohort_month: string;
  cohort_size: number;
  retention_d30: number;
  retention_d90: number;
  retention_d180: number;
};

export type LtvSummary = {
  avg_ltv_12m: number;
  avg_ltv_lifetime: number;
  repeat_purchase_rate: number;
  avg_days_between_purchases: number;
  total_customers: number;
  repeat_customers: number;
  cohorts: LtvCohort[];
  computed_at: string;
};

export function useLtvSummary(storeId?: string) {
  return useQuery({
    queryKey: ["ltv_summary_v1", storeId],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LtvSummary | null> => {
      if (!storeId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_ltv_summary_v1", {
        p_store_id: storeId,
      });
      if (error) throw error;
      return data as LtvSummary;
    },
  });
}