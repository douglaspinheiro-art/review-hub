import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Conta usuários distintos por etapa do funil de ativação a partir de
 * `funnel_telemetry_events`. RLS permite leitura para admins.
 */
export type ActivationFunnelStep = {
  key: string;
  label: string;
  users: number;
  /** Conversion vs the previous step (0-100). */
  convPct: number;
  /** Conversion vs the first step (0-100). */
  fromStartPct: number;
};

export type ActivationFunnelSummary = {
  steps: ActivationFunnelStep[];
  totalEvents: number;
};

const STEP_DEFS: { key: string; label: string; events: string[] }[] = [
  { key: "onboarding_started", label: "Onboarding iniciado", events: ["onboarding_started"] },
  { key: "onboarding_completed", label: "Onboarding completo", events: ["onboarding_completed"] },
  { key: "analisando_completed", label: "Diagnóstico gerado", events: ["analisando_completed", "diagnostic_generated"] },
  { key: "resultado_viewed", label: "Resultado visto", events: ["resultado_viewed"] },
  { key: "resultado_checkout_started", label: "Checkout iniciado", events: ["resultado_checkout_started", "checkout_started"] },
];

export function useActivationFunnel(rangeDays: 7 | 30) {
  return useQuery({
    queryKey: ["activation-funnel", rangeDays],
    queryFn: async (): Promise<ActivationFunnelSummary> => {
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const allEventNames = Array.from(new Set(STEP_DEFS.flatMap((s) => s.events)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("funnel_telemetry_events")
        .select("user_id,event_name,created_at")
        .in("event_name", allEventNames)
        .gte("created_at", since)
        .limit(5000);
      if (error) throw error;

      const rows = (data ?? []) as Array<{ user_id: string | null; event_name: string }>;
      const usersByEvent = new Map<string, Set<string>>();
      for (const r of rows) {
        if (!r.user_id) continue;
        if (!usersByEvent.has(r.event_name)) usersByEvent.set(r.event_name, new Set());
        usersByEvent.get(r.event_name)!.add(r.user_id);
      }

      const counted: { key: string; label: string; users: number }[] = STEP_DEFS.map((s) => {
        const merged = new Set<string>();
        for (const ev of s.events) {
          const set = usersByEvent.get(ev);
          if (set) for (const u of set) merged.add(u);
        }
        return { key: s.key, label: s.label, users: merged.size };
      });

      const start = counted[0]?.users || 0;
      const steps: ActivationFunnelStep[] = counted.map((s, i) => {
        const prev = i === 0 ? s.users : counted[i - 1].users;
        return {
          ...s,
          convPct: prev > 0 ? (s.users / prev) * 100 : 0,
          fromStartPct: start > 0 ? (s.users / start) * 100 : 0,
        };
      });

      return { steps, totalEvents: rows.length };
    },
    staleTime: 60_000,
  });
}