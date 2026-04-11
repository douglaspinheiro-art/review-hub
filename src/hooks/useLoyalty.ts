import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { logQueryTiming } from "@/lib/query-page-telemetry";

export const LOYALTY_TX_PAGE_SIZE = 25;

type LoyaltyRewardRow = Database["public"]["Tables"]["loyalty_rewards"]["Row"];

type RpcLoyaltySummary = {
  members_with_balance?: number;
  total_points_balance?: number;
  total_earned_sum?: number;
  total_redeemed_sum?: number;
  tier_counts?: Record<string, number> | null;
};

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

async function fetchLoyaltyAggregatesLegacy(userId: string): Promise<Omit<RpcLoyaltySummary, "tier_counts"> & { tier_counts: Record<string, number> }> {
  const { data: rows, error } = await supabase
    .from("loyalty_points")
    .select("points, total_earned, total_redeemed, tier")
    .eq("user_id", userId);
  if (error) throw error;
  const list = rows ?? [];
  const membersWithBalance = list.filter((r) => (r.points ?? 0) > 0).length;
  const totalPointsBalance = list.reduce((s, r) => s + (r.points ?? 0), 0);
  const totalEarnedSum = list.reduce((s, r) => s + (r.total_earned ?? 0), 0);
  const totalRedeemedSum = list.reduce((s, r) => s + (r.total_redeemed ?? 0), 0);
  const tierCounts: Record<string, number> = {};
  for (const r of list) {
    const t = (r.tier ?? "bronze").toLowerCase();
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }
  return {
    members_with_balance: membersWithBalance,
    total_points_balance: totalPointsBalance,
    total_earned_sum: totalEarnedSum,
    total_redeemed_sum: totalRedeemedSum,
    tier_counts: tierCounts,
  };
}

async function fetchLoyaltyDashboard(
  userId: string,
  rewardsStoreIdHint: string | null,
): Promise<LoyaltyDashboardData> {
  const t0 = performance.now();
  const [storesRes, profileRes] = await Promise.all([
    supabase.from("stores").select("id,name").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("loyalty_program_name, loyalty_slug, points_per_real, loyalty_program_enabled, loyalty_points_ttl_days")
      .eq("id", userId)
      .single(),
  ]);
  if (profileRes.error) throw profileRes.error;

  const storesBrief = (storesRes.data ?? []) as { id: string; name: string }[];
  const storeIds = storesBrief.map((r) => r.id);
  const rewardStoreId =
    rewardsStoreIdHint && storeIds.includes(rewardsStoreIdHint) ? rewardsStoreIdHint : storeIds[0] ?? null;

  let membersWithBalance = 0;
  let totalPointsBalance = 0;
  let totalEarnedSum = 0;
  let totalRedeemedSum = 0;
  let tierCounts: Record<string, number> = {};

  const { data: rpcRaw, error: rpcErr } = await supabase.rpc("get_loyalty_dashboard_summary");
  if (!rpcErr && rpcRaw != null && typeof rpcRaw === "object") {
    const rpc = rpcRaw as RpcLoyaltySummary;
    membersWithBalance = Number(rpc.members_with_balance ?? 0);
    totalPointsBalance = Number(rpc.total_points_balance ?? 0);
    totalEarnedSum = Number(rpc.total_earned_sum ?? 0);
    totalRedeemedSum = Number(rpc.total_redeemed_sum ?? 0);
    tierCounts = { ...(rpc.tier_counts ?? {}) };
  } else {
    const leg = await fetchLoyaltyAggregatesLegacy(userId);
    membersWithBalance = Number(leg.members_with_balance ?? 0);
    totalPointsBalance = Number(leg.total_points_balance ?? 0);
    totalEarnedSum = Number(leg.total_earned_sum ?? 0);
    totalRedeemedSum = Number(leg.total_redeemed_sum ?? 0);
    tierCounts = leg.tier_counts;
  }

  let rewards: LoyaltyRewardRow[] = [];
  if (rewardStoreId) {
    const rw = await supabase
      .from("loyalty_rewards")
      .select("*")
      .eq("store_id", rewardStoreId)
      .order("custo_pontos", { ascending: true });
    if (rw.error) console.warn("loyalty_rewards:", rw.error.message);
    else if (rw.data) rewards = rw.data;
  }

  logQueryTiming("loyalty-dashboard", t0);
  return {
    storeId: rewardStoreId,
    storeIds,
    storesBrief,
    membersWithBalance,
    totalPointsBalance,
    totalEarnedSum,
    totalRedeemedSum,
    tierCounts,
    profile: profileRes.data,
    rewards,
  };
}

/**
 * @param rewardsStoreId Loja cujo catálogo de `loyalty_rewards` mostrar (multi-loja). Null = primeira loja do tenant.
 */
export function useLoyaltyDashboard(rewardsStoreId: string | null = null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-dashboard", user?.id ?? null, rewardsStoreId],
    enabled: !!user?.id,
    queryFn: () => fetchLoyaltyDashboard(user!.id, rewardsStoreId),
    staleTime: 30_000,
  });
}

export function useLoyaltyTransactions(page: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-tx", user?.id ?? null, page],
    enabled: !!user?.id,
    staleTime: 20_000,
    queryFn: async () => {
      const from = page * LOYALTY_TX_PAGE_SIZE;
      const to = from + LOYALTY_TX_PAGE_SIZE - 1;
      const { data: txs, error, count } = await supabase
        .from("loyalty_transactions")
        .select("id, contact_id, points, reason, description, reference_id, created_at", { count: "exact" })
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const list = txs ?? [];
      const contactIds = [...new Set(list.map((t) => t.contact_id))];
      const contactMap: Record<string, { name: string; phone: string }> = {};
      if (contactIds.length) {
        const { data: contacts, error: cErr } = await supabase.from("contacts").select("id, name, phone").in("id", contactIds);
        if (cErr) throw cErr;
        for (const c of contacts ?? []) {
          contactMap[c.id] = { name: c.name, phone: c.phone };
        }
      }
      const rows: LoyaltyTxRow[] = list.map((t) => ({
        ...t,
        contactName: contactMap[t.contact_id]?.name ?? "—",
        contactPhone: contactMap[t.contact_id]?.phone ?? "",
      }));
      return { rows, total: count ?? 0 };
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

/** Exporta até `maxRows` transações recentes para CSV (uso pontual). */
export async function fetchLoyaltyTransactionsForExport(userId: string, maxRows: number): Promise<LoyaltyTxRow[]> {
  const { data: txs, error } = await supabase
    .from("loyalty_transactions")
    .select("id, contact_id, points, reason, description, reference_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(maxRows);
  if (error) throw error;
  const list = txs ?? [];
  const contactIds = [...new Set(list.map((t) => t.contact_id))];
  const contactMap: Record<string, { name: string; phone: string }> = {};
  if (contactIds.length) {
    const { data: contacts } = await supabase.from("contacts").select("id, name, phone").in("id", contactIds);
    for (const c of contacts ?? []) {
      contactMap[c.id] = { name: c.name, phone: c.phone };
    }
  }
  return list.map((t) => ({
    ...t,
    contactName: contactMap[t.contact_id]?.name ?? "—",
    contactPhone: contactMap[t.contact_id]?.phone ?? "",
  }));
}
