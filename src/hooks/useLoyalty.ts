import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export const LOYALTY_TX_PAGE_SIZE = 25;

type LoyaltyRewardRow = Database["public"]["Tables"]["loyalty_rewards"]["Row"];

export interface LoyaltyDashboardData {
  storeId: string | null;
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

async function fetchLoyaltyDashboard(userId: string): Promise<LoyaltyDashboardData> {
  const [storeRes, lpRes, profileRes] = await Promise.all([
    supabase.from("stores").select("id").eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("loyalty_points").select("points, total_earned, total_redeemed, tier").eq("user_id", userId),
    supabase
      .from("profiles")
      .select("loyalty_program_name, loyalty_slug, points_per_real, loyalty_program_enabled, loyalty_points_ttl_days")
      .eq("id", userId)
      .single(),
  ]);

  if (lpRes.error) throw lpRes.error;
  if (profileRes.error) throw profileRes.error;

  const rows = lpRes.data ?? [];
  const membersWithBalance = rows.filter((r) => (r.points ?? 0) > 0).length;
  const totalPointsBalance = rows.reduce((s, r) => s + (r.points ?? 0), 0);
  const totalEarnedSum = rows.reduce((s, r) => s + (r.total_earned ?? 0), 0);
  const totalRedeemedSum = rows.reduce((s, r) => s + (r.total_redeemed ?? 0), 0);
  const tierCounts: Record<string, number> = {};
  for (const r of rows) {
    const t = (r.tier ?? "bronze").toLowerCase();
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
  }

  const storeId = storeRes.data?.id ?? null;
  let rewards: LoyaltyRewardRow[] = [];
  if (storeId) {
    const rw = await supabase.from("loyalty_rewards").select("*").eq("store_id", storeId).order("custo_pontos", { ascending: true });
    if (rw.error) {
      console.warn("loyalty_rewards:", rw.error.message);
    } else if (rw.data) {
      rewards = rw.data;
    }
  }

  return {
    storeId,
    membersWithBalance,
    totalPointsBalance,
    totalEarnedSum,
    totalRedeemedSum,
    tierCounts,
    profile: profileRes.data,
    rewards,
  };
}

export function useLoyaltyDashboard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty-dashboard", user?.id ?? null],
    enabled: !!user?.id,
    queryFn: () => fetchLoyaltyDashboard(user!.id),
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["loyalty-dashboard", uid] }),
        qc.invalidateQueries({ queryKey: ["loyalty-tx", uid] }),
      ]);
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
