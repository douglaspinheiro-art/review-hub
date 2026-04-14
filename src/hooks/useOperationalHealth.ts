import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import type { Database } from "@/integrations/supabase/types";
import { DATA_QUALITY_SNAPSHOT_SELECT, FUNIL_DIARIO_SELECT } from "@/lib/supabase-select-fragments";

type FunilDiarioRow = Database["public"]["Tables"]["funil_diario"]["Row"];
type DataQualityRow = Database["public"]["Tables"]["data_quality_snapshots"]["Row"];

const WEBHOOK_LOOKBACK_H = 48;
const WEBHOOK_SAMPLE_LIMIT = 400;

function isWebhookFailure(row: {
  status: string;
  status_processamento: string | null;
  erro_mensagem: string | null;
  error_message: string | null;
}): boolean {
  const s = (row.status ?? "").toLowerCase();
  if (s === "failed") return true;
  if (row.erro_mensagem?.trim() || row.error_message?.trim()) return true;
  const p = (row.status_processamento ?? "").toLowerCase();
  return p === "erro";
}

function isWebhookPending(row: {
  status: string;
  status_processamento: string | null;
  created_at: string;
}): boolean {
  const p = (row.status_processamento ?? "").toLowerCase();
  const s = (row.status ?? "").toLowerCase();
  if (p === "sucesso" || p === "ignorado" || p === "custom_recebido") return false;
  if (s === "processed" || s === "failed") return false;
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  const staleMs = 2 * 60 * 60 * 1000;
  if (ageMs <= staleMs) return false;
  return !p || p === "pendente" || s === "pending" || s === "received";
}

export type OperationalHealthResult = {
  storeId: string | null;
  latestFunil: FunilDiarioRow | null;
  latestQuality: DataQualityRow | null;
  webhookFailures48h: number;
  webhookPendingStale48h: number;
};

export const operationalHealthQueryKey = (userId: string | undefined) =>
  ["operational-health", userId ?? null] as const;

export function useOperationalHealth() {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();

  return useQuery({
    queryKey: operationalHealthQueryKey(user?.id),
    enabled: !!user?.id && scope?.ready === true,
    queryFn: async (): Promise<OperationalHealthResult> => {
      const storeId = scope?.activeStoreId ?? null;
      if (!storeId) {
        return {
          storeId: null,
          latestFunil: null,
          latestQuality: null,
          webhookFailures48h: 0,
          webhookPendingStale48h: 0,
        };
      }

      const { data, error } = await supabase.rpc("get_operational_health_bundle_v2", {
        p_store_id: storeId,
      });

      if (error) throw error;
      const res = data as any;

      return {
        storeId,
        latestFunil: res.funil as FunilDiarioRow | null,
        latestQuality: res.quality as DataQualityRow | null,
        webhookFailures48h: Number(res.webhook_stats?.failures_48h ?? 0),
        webhookPendingStale48h: Number(res.webhook_stats?.stale_48h ?? 0),
      };
    },
    staleTime: 30_000,
  });
}
