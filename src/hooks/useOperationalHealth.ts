import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import type { Database } from "@/integrations/supabase/types";

type FunilDiarioRow = Database["public"]["Tables"]["funil_diario"]["Row"];
type DataQualityRow = Database["public"]["Tables"]["data_quality_snapshots"]["Row"];

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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