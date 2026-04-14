import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import type { Database } from "@/integrations/supabase/types";
import { logQueryTiming } from "@/lib/query-page-telemetry";

export const LOYALTY_TX_PAGE_SIZE = 25;

type LoyaltyRewardRow = Database["public"]["Tables"]["loyalty_rewards"]["Row"];

export interface LoyaltyDashboardData {
  storeId: string | null;
  /** Lojas do tenant (para seletor de recompensas). */
  storeIds: string[];
  storesBrief: { id: string; name: string }[];
  membersWithBalance: number;
  totalPointsBalance: number;
  totalEarnedSum: number;
  totalRedeemedSum: number;
  tierCounts: Record<string, number>;
  profile: {
    loyalty_program_name: string | null;
    loyalty_slug: string | null;
    points_per_real: number | null;
    loyalty_program_enabled: boolean | null;
    loyalty_points_ttl_days: number | null;
  } | null;
  rewards: LoyaltyRewardRow[];
}

export interface LoyaltyTxRow {
  id: string;
  contact_id: string;
  points: number;
  reason: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
  contactName: string;
  contactPhone: string;
}

async function fetchLoyaltyDashboard(
  userId: string,
  rewardsStoreIdHint: string | null,
): Promise<LoyaltyDashboardData> {
  const t0 = performance.now();
  
  const { data: bundle, error: bErr } = await supabase.rpc("get_loyalty_dashboard_bundle_v2", {
    p_user_id: userId,
    p_rewards_store_id: rewardsStoreIdHint ?? undefined,
  });

  if (bErr) throw bErr;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = bundle as any;
  const profile = res.profile;
  const stats = res.stats || {};
  const storesBrief = (res.stores || []) as { id: string; name: string }[];
  const storeIds = storesBrief.map((r) => r.id);
  const rewardStoreId =
    rewardsStoreIdHint && storeIds.includes(rewardsStoreIdHint) ? rewardsStoreIdHint : storeIds[0] ?? null;

  logQueryTiming("loyalty-dashboard-v2", t0);
  return {
    storeId: rewardStoreId,
    storeIds,
    storesBrief,
    membersWithBalance: Number(stats.members_with_balance ?? 0),
    totalPointsBalance: Number(stats.total_points_balance ?? 0),
    totalEarnedSum: Number(stats.total_earned_sum ?? 0),
    totalRedeemedSum: Number(stats.total_redeemed_sum ?? 0),
    tierCounts: stats.tier_counts || {},
    profile: profile,
    rewards: (res.rewards || []) as LoyaltyRewardRow[],
  };
}

/**
 * @param rewardsStoreId Loja cujo catálogo de `loyalty_rewards` mostrar (multi-loja). Null = primeira loja do tenant.
 */
export function useLoyaltyDashboard(rewardsStoreId: string | null = null) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  return useQuery({
    queryKey: ["loyalty-dashboard", user?.id ?? null, scope?.activeStoreId ?? null, rewardsStoreId],
    // Wait for scope to resolve so team members see the correct store's data.
    enabled: !!user?.id && scope?.ready === true,
    queryFn: () => fetchLoyaltyDashboard(user!.id, rewardsStoreId),
    staleTime: 30_000,
    gcTime: 30 * 60_000, // Keep cached 30 min so tab switches don't re-fetch.
    retry: 1,
  });
}

export function useLoyaltyTransactions(cursor: string | null = null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-tx", user?.id ?? null, cursor],
    enabled: !!user?.id,
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_loyalty_transactions_v2", {
        p_user_id: user!.id,
        p_cursor_created_at: cursor ?? undefined,
        p_limit: LOYALTY_TX_PAGE_SIZE,
      });

      if (error) throw error;
      const res = data as any;
      const rows: LoyaltyTxRow[] = (res.rows || []).map((t: any) => ({
        id: t.id,
        contact_id: t.contact_id,
        points: t.points,
        reason: t.reason,
        description: t.description,
        reference_id: t.reference_id,
        created_at: t.created_at,
        contactName: t.contact_name,
        contactPhone: t.contact_phone,
      }));
      return { rows, total: Number(res.total_count ?? 0) };
    },
  });
}

export type LoyaltyProfileUpdate = Pick<
  Database["public"]["Tables"]["profiles"]["Update"],
  | "loyalty_program_name"
  | "loyalty_slug"
  | "points_per_real"
  | "loyalty_program_enabled"
  | "loyalty_points_ttl_days"
>;

export function useUpdateLoyaltyProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LoyaltyProfileUpdate) => {
      const { error } = await supabase.from("profiles").update(payload).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      const uid = user?.id ?? null;
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "loyalty-dashboard" &&
          (uid == null || q.queryKey[1] === uid),
      });
      await qc.invalidateQueries({ queryKey: ["loyalty-tx", uid] });
    },
  });
}

/** Exporta TODAS as transações em páginas de 1000 (sem limite artificial). */
export async function fetchLoyaltyTransactionsForExport(
  userId: string,
  _maxRows: number,
  onProgress?: (fetched: number) => void,
): Promise<LoyaltyTxRow[]> {
  const PAGE_SIZE = 1000;
  const allTxs: typeof loyaltyTxColumns[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: txs, error } = await supabase
      .from("loyalty_transactions")
      .select("id, contact_id, points, reason, description, reference_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    const batch = txs ?? [];
    allTxs.push(...(batch as typeof allTxs));
    onProgress?.(allTxs.length);
    hasMore = batch.length === PAGE_SIZE;
    page++;
  }

  const list = allTxs as Array<{ id: string; contact_id: string; points: number; reason: string; description: string | null; reference_id: string | null; created_at: string }>;
  const contactIds = [...new Set(list.map((t) => t.contact_id))];
  const contactMap: Record<string, { name: string; phone: string }> = {};
  if (contactIds.length) {
    // Batch contact lookups in groups of 500 to avoid URL length limits.
    for (let i = 0; i < contactIds.length; i += 500) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .in("id", contactIds.slice(i, i + 500));
      for (const c of contacts ?? []) {
        contactMap[c.id] = { name: c.name, phone: c.phone };
      }
    }
  }
  return list.map((t) => ({
    ...t,
    contactName: contactMap[t.contact_id]?.name ?? "—",
    contactPhone: contactMap[t.contact_id]?.phone ?? "",
  }));
}

// Internal type placeholder — avoids a circular reference in the array push above.
const loyaltyTxColumns = {} as { id: string; contact_id: string; points: number; reason: string; description: string | null; reference_id: string | null; created_at: string };
