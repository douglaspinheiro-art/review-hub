import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type EmailHealth = {
  totalContacts: number;
  hardBounces: number;
  complaints: number;
  unsubscribed: number;
  bounceRate: number;
  complaintRate: number;
  optOutRate: number;
  status: "healthy" | "warning" | "critical";
  computedAt: string;
};

export function useEmailHealth(storeId?: string) {
  return useQuery({
    queryKey: ["email_health", storeId],
    enabled: !!storeId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EmailHealth | null> => {
      if (!storeId) return null;
      const [totalRes, bounceRes, complaintRes, unsubRes] = await Promise.all([
        supabase
          .from("customers_v3")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId)
          .not("email", "is", null),
        supabase
          .from("customers_v3")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId)
          .not("email_hard_bounce_at", "is", null),
        supabase
          .from("customers_v3")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId)
          .not("email_complaint_at", "is", null),
        supabase
          .from("customers_v3")
          .select("id", { count: "exact", head: true })
          .eq("store_id", storeId)
          .not("unsubscribed_at", "is", null),
      ]);

      const total = totalRes.count ?? 0;
      const bounces = bounceRes.count ?? 0;
      const complaints = complaintRes.count ?? 0;
      const unsub = unsubRes.count ?? 0;

      const bounceRate = total > 0 ? (bounces / total) * 100 : 0;
      const complaintRate = total > 0 ? (complaints / total) * 100 : 0;
      const optOutRate = total > 0 ? (unsub / total) * 100 : 0;

      // Industry thresholds: bounce >5% bad, complaint >0.3% bad
      let status: EmailHealth["status"] = "healthy";
      if (bounceRate > 5 || complaintRate > 0.3) status = "critical";
      else if (bounceRate > 2 || complaintRate > 0.1 || optOutRate > 2) status = "warning";

      return {
        totalContacts: total,
        hardBounces: bounces,
        complaints,
        unsubscribed: unsub,
        bounceRate,
        complaintRate,
        optOutRate,
        status,
        computedAt: new Date().toISOString(),
      };
    },
  });
}