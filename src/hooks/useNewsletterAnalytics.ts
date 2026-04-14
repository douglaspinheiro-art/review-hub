import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type NewsletterCampaignStats = {
  totalOpens: number;
  uniqueOpeners: number;
  totalClicks: number;
  uniqueClickers: number;
  topLinks: { url: string; count: number }[];
};

export function useNewsletterCampaignStats(campaignId: string | undefined, channel?: string | null, userId?: string | null, storeId?: string | null) {
  return useQuery({
    queryKey: ["newsletter-campaign-stats", campaignId, userId ?? null, storeId ?? null],
    queryFn: async (): Promise<NewsletterCampaignStats> => {
      if (!campaignId) {
        return { totalOpens: 0, uniqueOpeners: 0, totalClicks: 0, uniqueClickers: 0, topLinks: [] };
      }

      // Limit to 10k rows to prevent memory exhaustion on large campaigns.
      // Aggregation at this scale is good enough for UI display; exact counts
      // should come from a server-side RPC if precision is needed.
      const { data: events, error } = await supabase
        .from("email_engagement_events")
        .select("event_type,customer_id,link_url")
        .eq("campaign_id", campaignId)
        .limit(10_000);

      if (error) throw error;

      const rows = events ?? [];
      const opens = rows.filter((r) => r.event_type === "open");
      const clicks = rows.filter((r) => r.event_type === "click");

      const uniqueOpeners = new Set(opens.map((r) => r.customer_id)).size;
      const uniqueClickers = new Set(clicks.map((r) => r.customer_id)).size;

      const linkCount = new Map<string, number>();
      for (const r of clicks) {
        if (!r.link_url) continue;
        linkCount.set(r.link_url, (linkCount.get(r.link_url) ?? 0) + 1);
      }
      const topLinks = [...linkCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([url, count]) => ({ url, count }));

      return {
        totalOpens: opens.length,
        uniqueOpeners,
        totalClicks: clicks.length,
        uniqueClickers,
        topLinks,
      };
    },
    enabled: !!campaignId && channel === "email",
    staleTime: 30_000,
  });
}
