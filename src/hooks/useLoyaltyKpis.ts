import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface LoyaltyKpis {
  active_members: number;
  points_circulating: number;
  points_redeemed: number;
  points_earned: number;
  redemption_rate_pct: number;
  tier_counts: Record<string, number>;
}

export function useLoyaltyKpis() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-kpis-v1", user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<LoyaltyKpis> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_loyalty_kpis_v1", { p_user_id: user!.id });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      return {
        active_members: Number(r?.active_members ?? 0),
        points_circulating: Number(r?.points_circulating ?? 0),
        points_redeemed: Number(r?.points_redeemed ?? 0),
        points_earned: Number(r?.points_earned ?? 0),
        redemption_rate_pct: Number(r?.redemption_rate_pct ?? 0),
        tier_counts: (r?.tier_counts ?? {}) as Record<string, number>,
      };
    },
  });
}
