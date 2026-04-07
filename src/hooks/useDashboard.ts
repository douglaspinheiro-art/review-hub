import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

async function getCurrentUserAndStore(): Promise<{ userId: string | null; storeId: string | null }> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) return { userId: null, storeId: null };

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { userId, storeId: (store as any)?.id ?? null };
}

export function useDashboardStats(days = 30) {
  return useQuery({
    queryKey: ["dashboard-stats", days],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) throw new Error("Não autenticado");

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const baseFilter = storeId
        ? (q: ReturnType<typeof supabase.from>) => (q as any).eq("store_id", storeId)
        : (q: ReturnType<typeof supabase.from>) => (q as any).eq("user_id", userId);

      const customersQuery = storeId
        ? supabase.from("customers_v3").select("id", { count: "exact" }).eq("store_id", storeId)
        : supabase.from("contacts").select("id", { count: "exact" }).eq("user_id", userId);

      const conversationsQuery = storeId
        ? supabase.from("conversations").select("id, status, unread_count", { count: "exact" }).eq("store_id", storeId)
        : supabase.from("conversations").select("id, status, unread_count", { count: "exact" }).eq("user_id", userId);

      const campaignsQuery = storeId
        ? supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count").eq("store_id", storeId)
        : supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count").eq("user_id", userId);

      const analyticsFilter = storeId
        ? supabase.from("analytics_daily").select("*").eq("store_id", storeId)
        : supabase.from("analytics_daily").select("*").eq("user_id", userId);

      const opportunitiesFilter = storeId
        ? supabase.from("opportunities").select("id", { count: "exact" }).eq("store_id", storeId)
        : supabase.from("opportunities").select("id", { count: "exact" }).eq("user_id", userId);

      const [customersRes, conversationsRes, campaignsRes, analyticsRes, analyticsPrevRes, opportunitiesRes] = await Promise.all([
        customersQuery,
        conversationsQuery,
        campaignsQuery,
        analyticsFilter.gte("date", since).order("date", { ascending: true }),
        analyticsFilter.select("revenue_influenced").gte("date", prevSince).lt("date", since),
        opportunitiesFilter.neq("status", "resolvido"),
      ]);

      const analytics = analyticsRes.data ?? [];
      const campaigns = campaignsRes.data ?? [];

      const totalContacts = customersRes.count ?? 0;
      const openConversations = (conversationsRes.data ?? []).filter((c) => c.status === "open").length;
      const totalUnread = (conversationsRes.data ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

      const completedCampaigns = campaigns.filter((c) => c.status === "completed" || c.status === "running");
      const totalSent = completedCampaigns.reduce((s, c) => s + c.sent_count, 0);
      const totalRead = completedCampaigns.reduce((s, c) => s + c.read_count, 0);
      const avgReadRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0;

      const revenueLast30 = analytics.reduce((s, d) => s + Number(d.revenue_influenced), 0);
      const newContactsLast30 = analytics.reduce((s, d) => s + d.new_contacts, 0);

      const revenuePrev = (analyticsPrevRes.data ?? []).reduce((s, d) => s + Number(d.revenue_influenced), 0);
      const revGrowth = revenuePrev > 0 ? Math.round(((revenueLast30 - revenuePrev) / revenuePrev) * 100) : 0;

      const totalDelivered = analytics.reduce((s, d) => s + d.messages_delivered, 0);
      const totalSentAll = analytics.reduce((s, d) => s + d.messages_sent, 0);
      const deliveryRate = totalSentAll > 0 ? Math.round((totalDelivered / totalSentAll) * 100) : 0;

      return {
        totalContacts,
        activeContacts: totalContacts,
        openConversations,
        totalUnread,
        avgReadRate,
        revenueLast30,
        newContactsLast30,
        revGrowth,
        deliveryRate,
        activeOpportunities: opportunitiesRes.count ?? 0,
        chartData: analytics.map((d) => ({
          date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          enviadas: d.messages_sent,
          entregues: d.messages_delivered,
          lidas: d.messages_read,
          receita: Number(d.revenue_influenced),
        })),
      };
    },
    staleTime: 60_000,
  });
}

export function useRecentConversations() {
  return useQuery({
    queryKey: ["recent-conversations"],
    queryFn: async () => {
      const { userId } = await getCurrentUserAndStore();
      if (!userId) return [];

      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count,
          contacts (id, name, phone, tags)
        `)
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { userId } = await getCurrentUserAndStore();
      if (!userId) return [];

      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return [];

      const query = storeId
        ? supabase.from("customers_v3").select("*").eq("store_id", storeId)
        : supabase.from("customers_v3").select("*").eq("user_id", userId);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useConversations(statusFilter = "all") {
  return useQuery({
    queryKey: ["conversations", statusFilter],
    queryFn: async () => {
      const { userId } = await getCurrentUserAndStore();
      if (!userId) return [];

      let query = supabase
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count,
          contacts (id, name, phone, tags)
        `)
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 20_000,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!conversationId,
    staleTime: 10_000,
  });
}

export function useAnalytics(days = 30) {
  return useQuery({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return null;

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const query = storeId
        ? supabase.from("analytics_daily").select("*").eq("store_id", storeId)
        : supabase.from("analytics_daily").select("*").eq("user_id", userId);

      const { data, error } = await query.gte("date", since).order("date", { ascending: true });
      if (error) throw error;

      const rows = data ?? [];
      const totals = rows.reduce(
        (acc, d) => ({
          messagesSent: acc.messagesSent + d.messages_sent,
          messagesDelivered: acc.messagesDelivered + d.messages_delivered,
          messagesRead: acc.messagesRead + d.messages_read,
          newContacts: acc.newContacts + d.new_contacts,
          revenue: acc.revenue + Number(d.revenue_influenced),
        }),
        { messagesSent: 0, messagesDelivered: 0, messagesRead: 0, newContacts: 0, revenue: 0 }
      );

      const deliveryRate = totals.messagesSent > 0
        ? Math.round((totals.messagesDelivered / totals.messagesSent) * 100)
        : 0;
      const readRate = totals.messagesDelivered > 0
        ? Math.round((totals.messagesRead / totals.messagesDelivered) * 100)
        : 0;

      return {
        rows,
        totals,
        deliveryRate,
        readRate,
        chartData: rows.map((d) => ({
          date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          enviadas: d.messages_sent,
          entregues: d.messages_delivered,
          lidas: d.messages_read,
          novos_contatos: d.new_contacts,
          receita: Number(d.revenue_influenced),
        })),
      };
    },
    staleTime: 60_000,
  });
}

export function useROIAttribution(days = 30) {
  return useQuery({
    queryKey: ["roi-attribution", days],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return null;

      const since = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
      const prevSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString().split("T")[0];
      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

      const analyticsBase = storeId
        ? supabase.from("analytics_daily").select("*").eq("store_id", storeId)
        : supabase.from("analytics_daily").select("*").eq("user_id", userId);

      const cartsBase = storeId
        ? supabase.from("abandoned_carts").select("status,cart_value,recovered_at,campaign_id,automation_id").eq("store_id", storeId)
        : supabase.from("abandoned_carts").select("status,cart_value,recovered_at,campaign_id,automation_id").eq("user_id", userId);

      const campaignsBase = storeId
        ? supabase.from("campaigns").select("id,name,channel,sent_count").eq("store_id", storeId)
        : supabase.from("campaigns").select("id,name,channel,sent_count").eq("user_id", userId);

      const [analyticsRes, analyticsPrevRes, cartsRes, campaignsRes, attributionRes] = await Promise.all([
        analyticsBase.gte("date", since).order("date", { ascending: true }),
        analyticsBase.select("revenue_influenced").gte("date", prevSince).lt("date", since),
        cartsBase.gte("created_at", sinceIso),
        campaignsBase,
        // attribution_events may not exist — handle gracefully
        supabase
          .from("attribution_events")
          .select("order_value,attributed_campaign_id,attributed_automation_id")
          .eq("user_id", userId)
          .gte("order_date", sinceIso)
          .then((r: any) => r, () => ({ data: null, error: { message: "table missing" } })),
      ]);

      const analytics = analyticsRes.data ?? [];
      const carts = cartsRes.data ?? [];
      const campaigns = campaignsRes.data ?? [];
      const attribution = attributionRes.error ? [] : (attributionRes.data ?? []);

      // ── Revenue totals ──────────────────────────────────────────────
      const totalRevenue = analytics.reduce((s, d) => s + Number(d.revenue_influenced), 0);
      const prevRevenue = (analyticsPrevRes.data ?? []).reduce((s, d) => s + Number(d.revenue_influenced), 0);
      const revGrowth = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;

      // ── Per-campaign breakdown (from attribution_events) ────────────
      const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c]));
      const byCampaignMap: Record<string, { id: string; name: string; channel: string; revenue: number; conversions: number; sent: number }> = {};

      for (const ev of attribution) {
        const cid = ev.attributed_campaign_id;
        if (!cid) continue;
        if (!byCampaignMap[cid]) {
          const c = campaignMap[cid];
          byCampaignMap[cid] = {
            id: cid,
            name: c?.name ?? "Campanha removida",
            channel: c?.channel ?? "whatsapp",
            revenue: 0,
            conversions: 0,
            sent: c?.sent_count ?? 0,
          };
        }
        byCampaignMap[cid].revenue += Number(ev.order_value);
        byCampaignMap[cid].conversions += 1;
      }
      const byCampaign = Object.values(byCampaignMap).sort((a, b) => b.revenue - a.revenue);

      // ── Source breakdown ─────────────────────────────────────────────
      const campaignRevenue = attribution.filter((e) => e.attributed_campaign_id).reduce((s, e) => s + Number(e.order_value), 0);
      const automationRevenue = attribution.filter((e) => e.attributed_automation_id && !e.attributed_campaign_id).reduce((s, e) => s + Number(e.order_value), 0);
      const attributedTotal = campaignRevenue + automationRevenue;

      // If no attribution data, fall back to proportional estimate
      const hasAttribution = attribution.length > 0;
      const sourceBreakdown = hasAttribution
        ? {
            campaigns: campaignRevenue,
            automations: automationRevenue,
            direct: Math.max(0, totalRevenue - attributedTotal),
          }
        : {
            campaigns: totalRevenue * 0.55,
            automations: totalRevenue * 0.30,
            direct: totalRevenue * 0.15,
          };

      // ── Cart recovery ────────────────────────────────────────────────
      const totalCarts = carts.length;
      const recoveredCarts = carts.filter((c) => c.status === "recovered").length;
      const recoveryRate = totalCarts > 0 ? Math.round((recoveredCarts / totalCarts) * 100) : 0;
      const recoveredValue = carts.filter((c) => c.status === "recovered").reduce((s, c) => s + Number(c.cart_value), 0);

      // ── Attribution quality ─────────────────────────────────────────
      const totalConversions = attribution.length;
      const directPct = hasAttribution ? Math.round((campaignRevenue / Math.max(totalRevenue, 1)) * 100) : 82;
      const assistedPct = hasAttribution ? Math.round((automationRevenue / Math.max(totalRevenue, 1)) * 100) : 18;

      return {
        totalRevenue,
        revGrowth,
        roas: totalRevenue > 0 ? totalRevenue / 297 : 0,
        byCampaign,
        sourceBreakdown,
        cartStats: { total: totalCarts, recovered: recoveredCarts, recoveryRate, recoveredValue },
        totalConversions,
        directPct,
        assistedPct,
        hasAttribution,
        chartData: analytics.map((d) => ({
          date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          receita: Number(d.revenue_influenced),
        })),
      };
    },
    staleTime: 60_000,
  });
}

export function useProblems() {
  return useQuery({
    queryKey: ["problems"],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return [];

      const query = storeId
        ? supabase.from("opportunities").select("*").eq("store_id", storeId)
        : supabase.from("opportunities").select("*").eq("user_id", userId);

      const { data, error } = await query
        .neq("status", "resolvido")
        .neq("status", "ignorado")
        .order("detected_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}
