import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface InboxSlaKpis {
  open_conversations: number;
  total_last_7d: number;
  within_sla_count: number;
  breach_count: number;
  pct_within_sla: number;
  avg_first_response_min: number;
}

export function useInboxSlaKpis() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inbox-sla-kpis-v1", user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<InboxSlaKpis> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_inbox_sla_kpis_v1", { p_user_id: user!.id });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      return {
        open_conversations: Number(r?.open_conversations ?? 0),
        total_last_7d: Number(r?.total_last_7d ?? 0),
        within_sla_count: Number(r?.within_sla_count ?? 0),
        breach_count: Number(r?.breach_count ?? 0),
        pct_within_sla: Number(r?.pct_within_sla ?? 0),
        avg_first_response_min: Number(r?.avg_first_response_min ?? 0),
      };
    },
  });
}
