import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentUserAndStore } from "@/hooks/useDashboard";
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

  return useQuery({
    queryKey: operationalHealthQueryKey(user?.id),
    enabled: !!user?.id,
    queryFn: async (): Promise<OperationalHealthResult> => {
      const { storeId } = await getCurrentUserAndStore();
      if (!storeId) {
        return {
          storeId: null,
          latestFunil: null,
          latestQuality: null,
          webhookFailures48h: 0,
          webhookPendingStale48h: 0,
        };
      }

      const since = new Date(Date.now() - WEBHOOK_LOOKBACK_H * 60 * 60 * 1000).toISOString();

      const [funilRes, qualityRes, webhookRes] = await Promise.all([
        supabase
          .from("funil_diario")
          .select(FUNIL_DIARIO_SELECT)
          .eq("store_id", storeId)
          .order("ingested_at", { ascending: false, nullsFirst: false })
          .order("metric_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("data_quality_snapshots")
          .select(DATA_QUALITY_SNAPSHOT_SELECT)
          .eq("store_id", storeId)
          .order("snapshot_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("webhook_logs")
          .select("id, status, status_processamento, erro_mensagem, error_message, created_at")
          .eq("store_id", storeId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(WEBHOOK_SAMPLE_LIMIT),
      ]);

      if (funilRes.error) throw funilRes.error;
      if (qualityRes.error) throw qualityRes.error;
      if (webhookRes.error) throw webhookRes.error;

      const wh = webhookRes.data ?? [];
      let webhookFailures48h = 0;
      let webhookPendingStale48h = 0;
      for (const row of wh) {
        if (isWebhookFailure(row)) webhookFailures48h += 1;
        else if (isWebhookPending(row)) webhookPendingStale48h += 1;
      }

      return {
        storeId,
        latestFunil: funilRes.data as FunilDiarioRow | null,
        latestQuality: qualityRes.data as DataQualityRow | null,
        webhookFailures48h,
        webhookPendingStale48h,
      };
    },
    staleTime: 30_000,
  });
}
