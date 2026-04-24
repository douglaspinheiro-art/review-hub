/**
 * Lê o último diagnostics_v3 do usuário e expõe o delta semanal (`week_over_week`)
 * quando o registro foi gerado pelo cron `weekly-diagnostic-cron`.
 *
 * Não dispara nova edge function — reusa o cache do TanStack Query.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface WeekOverWeek {
  chs_delta?: number;
  cvr_delta_pp?: number;
  perda_delta_brl?: number;
  gargalo_anterior?: string | null;
  gargalo_atual?: string | null;
  gargalo_changed?: boolean;
  applied_recommendation?: string | null;
  previous_created_at?: string | null;
}

export interface WeeklyDiagnosticDelta {
  hasDelta: boolean;
  weekOverWeek: WeekOverWeek | null;
  previousCreatedAt: string | null;
  currentCreatedAt: string | null;
  triggerSource: string | null;
}

export function useWeeklyDiagnosticDelta() {
  const { user } = useAuth();

  return useQuery<WeeklyDiagnosticDelta>({
    queryKey: ["weekly-diagnostic-delta", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("diagnostics_v3")
        .select("created_at, trigger_source, week_over_week")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return { hasDelta: false, weekOverWeek: null, previousCreatedAt: null, currentCreatedAt: null, triggerSource: null };
      }

      const wow = (data.week_over_week ?? null) as WeekOverWeek | null;
      const previousCreatedAt = wow?.previous_created_at ?? null;
      return {
        hasDelta: !!(wow && previousCreatedAt),
        weekOverWeek: wow,
        previousCreatedAt,
        currentCreatedAt: data.created_at ?? null,
        triggerSource: data.trigger_source ?? null,
      };
    },
  });
}