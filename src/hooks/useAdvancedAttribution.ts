import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";

/**
 * Métricas avançadas de atribuição:
 * - Time-to-conversion: gap em horas entre `attribution_events.created_at` (ou send) e `order_date`.
 * - Conversões assistidas vs diretas: agregadas a partir da tabela `executions`.
 * Janela: últimos N dias (default 30) escopados pela loja ativa via campanhas/automações da loja.
 */
export interface AdvancedAttributionData {
  ttcBuckets: Array<{ bucket: string; count: number; pctOfTotal: number }>;
  ttcMedianHours: number | null;
  ttcAvgHours: number | null;
  ttcSampleSize: number;
  assistedTotal: number;
  directTotal: number;
  assistedRatePct: number;
  topAssistingCampaigns: Array<{ id: string; name: string; assisted: number; direct: number }>;
}

const BUCKETS: Array<{ label: string; maxHours: number }> = [
  { label: "≤ 1h", maxHours: 1 },
  { label: "1–6h", maxHours: 6 },
  { label: "6–24h", maxHours: 24 },
  { label: "1–3 dias", maxHours: 72 },
  { label: "3–7 dias", maxHours: 168 },
  { label: "> 7 dias", maxHours: Number.POSITIVE_INFINITY },
];

export function useAdvancedAttribution(periodDays: number = 30) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeId = scope?.activeStoreId ?? null;

  return useQuery<AdvancedAttributionData>({
    queryKey: ["advanced-attribution", user?.id, storeId, periodDays],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

      // 1) Eventos de atribuição do usuário no período.
      const { data: events } = await supabase
        .from("attribution_events")
        .select("id, order_date, created_at, attributed_campaign_id")
        .eq("user_id", user!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);

      let scopedEvents = events ?? [];

      // 2) Filtra por campanhas da loja, se houver loja ativa.
      let campaignNameById = new Map<string, string>();
      if (storeId) {
        const { data: storeCamps } = await supabase
          .from("campaigns")
          .select("id, name")
          .eq("store_id", storeId)
          .limit(5000);
        const set = new Set((storeCamps ?? []).map((c) => c.id));
        campaignNameById = new Map((storeCamps ?? []).map((c) => [c.id, c.name as string]));
        scopedEvents = scopedEvents.filter((e) => {
          const cid = e.attributed_campaign_id;
          // Mantém eventos sem campanha (automação pura / UTM) — alinhado com `scopeAttributionEventsForStore`.
          if (!cid) return true;
          return set.has(cid);
        });
      }

      // 3) Calcula gaps em horas (order_date - created_at do evento).
      const gaps: number[] = [];
      for (const e of scopedEvents) {
        if (!e.order_date || !e.created_at) continue;
        const order = new Date(e.order_date as string).getTime();
        const seen = new Date(e.created_at as string).getTime();
        if (!Number.isFinite(order) || !Number.isFinite(seen)) continue;
        const diffH = (order - seen) / (1000 * 60 * 60);
        // Mantém apenas valores positivos plausíveis (até 30 dias).
        if (diffH >= 0 && diffH <= 24 * 30) gaps.push(diffH);
      }

      const counts = BUCKETS.map((b) => ({ label: b.label, max: b.maxHours, count: 0 }));
      let prevMax = 0;
      for (const g of gaps) {
        for (let i = 0; i < counts.length; i++) {
          const lower = i === 0 ? 0 : counts[i - 1].max;
          if (g > lower && g <= counts[i].max) {
            counts[i].count += 1;
            break;
          }
          if (i === 0 && g <= counts[0].max) {
            counts[0].count += 1;
            break;
          }
        }
      }
      // Reset accumulator var (keeps lint happy when unused branch).
      void prevMax;

      const totalGaps = gaps.length;
      const ttcBuckets = counts.map((c) => ({
        bucket: c.label,
        count: c.count,
        pctOfTotal: totalGaps > 0 ? Math.round((c.count / totalGaps) * 100) : 0,
      }));

      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const ttcMedianHours =
        sortedGaps.length > 0 ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;
      const ttcAvgHours =
        sortedGaps.length > 0 ? sortedGaps.reduce((s, n) => s + n, 0) / sortedGaps.length : null;

      // 4) Assistidas vs diretas — soma de `executions` no período.
      let execQuery = supabase
        .from("executions")
        .select("id, conversoes_assistidas, conversoes_diretas, prescricao_id, store_id, iniciada_em")
        .eq("user_id", user!.id)
        .gte("iniciada_em", since)
        .limit(5000);
      if (storeId) execQuery = execQuery.eq("store_id", storeId);
      const { data: execs } = await execQuery;

      let assistedTotal = 0;
      let directTotal = 0;
      for (const ex of execs ?? []) {
        assistedTotal += Number(ex.conversoes_assistidas ?? 0);
        directTotal += Number(ex.conversoes_diretas ?? 0);
      }
      const assistedRatePct =
        assistedTotal + directTotal > 0
          ? Math.round((assistedTotal / (assistedTotal + directTotal)) * 100)
          : 0;

      // 5) Top campanhas assistentes — agrupado por prescricao→campaign quando disponível.
      const campaignAgg = new Map<string, { assisted: number; direct: number }>();
      for (const ex of execs ?? []) {
        const key = (ex.prescricao_id as string | null) ?? "sem-campanha";
        const cur = campaignAgg.get(key) ?? { assisted: 0, direct: 0 };
        cur.assisted += Number(ex.conversoes_assistidas ?? 0);
        cur.direct += Number(ex.conversoes_diretas ?? 0);
        campaignAgg.set(key, cur);
      }
      const topAssistingCampaigns = Array.from(campaignAgg.entries())
        .map(([id, v]) => ({
          id,
          name: campaignNameById.get(id) ?? (id === "sem-campanha" ? "Sem campanha vinculada" : id.slice(0, 8)),
          assisted: v.assisted,
          direct: v.direct,
        }))
        .filter((x) => x.assisted > 0 || x.direct > 0)
        .sort((a, b) => b.assisted - a.assisted)
        .slice(0, 6);

      return {
        ttcBuckets,
        ttcMedianHours,
        ttcAvgHours,
        ttcSampleSize: totalGaps,
        assistedTotal,
        directTotal,
        assistedRatePct,
        topAssistingCampaigns,
      };
    },
  });
}