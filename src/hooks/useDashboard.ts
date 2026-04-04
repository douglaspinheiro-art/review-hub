import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function analyticsQuery(userId: string | null) {
  const q = supabase.from("analytics_daily").select("*");
  // Filter by user_id when the column exists (after migration)
  return userId ? q.eq("user_id", userId) : q;
}

export function useDashboardStats(days = 30) {
  return useQuery({
    queryKey: ["dashboard-stats", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const userId = await getCurrentUserId();

      const [contactsRes, conversationsRes, campaignsRes, analyticsRes, analyticsPrevRes, automationsRes, cartsRes] = await Promise.all([
        supabase.from("contacts").select("id, status", { count: "exact" }),
        supabase.from("conversations").select("id, status, unread_count", { count: "exact" }),
        supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count"),
        analyticsQuery(userId).gte("date", since).order("date", { ascending: true }),
        analyticsQuery(userId).select("revenue_influenced").gte("date", prevSince).lt("date", since),
        supabase.from("automations").select("id", { count: "exact" }).eq("status", "active"),
        supabase.from("abandoned_carts").select("id, recovered_value").eq("status", "recovered").gte("recovered_at", since),
      ]);

      const contacts = contactsRes.data ?? [];
      const conversations = conversationsRes.data ?? [];
      const campaigns = campaignsRes.data ?? [];
      const analytics = analyticsRes.data ?? [];

      const totalContacts = contactsRes.count ?? 0;
      const activeContacts = contacts.filter((c) => c.status === "active").length;
      const openConversations = conversations.filter((c) => c.status === "open").length;
      const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

      const completedCampaigns = campaigns.filter((c) => c.status === "completed" || c.status === "running");
      const totalSent = completedCampaigns.reduce((s, c) => s + c.sent_count, 0);
      const totalRead = completedCampaigns.reduce((s, c) => s + c.read_count, 0);
      const avgReadRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0;

      const last7 = analytics.slice(-7);
      const prev7 = analytics.slice(-14, -7);
      const msgLast7 = last7.reduce((s, d) => s + d.messages_sent, 0);
      const msgPrev7 = prev7.reduce((s, d) => s + d.messages_sent, 0);
      const msgGrowth = msgPrev7 > 0 ? Math.round(((msgLast7 - msgPrev7) / msgPrev7) * 100) : 0;

      const revenueLast30 = analytics.reduce((s, d) => s + Number(d.revenue_influenced), 0);
      const newContactsLast30 = analytics.reduce((s, d) => s + d.new_contacts, 0);

      const revenuePrev = (analyticsPrevRes.data ?? []).reduce((s, d) => s + Number(d.revenue_influenced), 0);
      const revGrowth = revenuePrev > 0 ? Math.round(((revenueLast30 - revenuePrev) / revenuePrev) * 100) : 0;

      const totalDelivered = analytics.reduce((s, d) => s + d.messages_delivered, 0);
      const totalSentAll = analytics.reduce((s, d) => s + d.messages_sent, 0);
      const deliveryRate = totalSentAll > 0 ? Math.round((totalDelivered / totalSentAll) * 100) : 0;

      const activeAutomations = automationsRes.count ?? 0;
      const carts = cartsRes.data ?? [];
      const recoveredCarts = carts.length;
      const recoveredValue = carts.reduce((s, c) => s + Number(c.recovered_value ?? 0), 0);

      return {
        totalContacts,
        activeContacts,
        openConversations,
        totalUnread,
        avgReadRate,
        msgLast7,
        msgGrowth,
        revenueLast30,
        newContactsLast30,
        revGrowth,
        deliveryRate,
        activeAutomations,
        recoveredCarts,
        recoveredValue,
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
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRecentConversations() {
  return useQuery({
    queryKey: ["recent-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count,
          contacts (id, name, phone, tags)
        `)
        .order("last_message_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*, ab_tests(winner_variant, status, decide_after_hours)")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      // Flatten ab_test winner_variant onto each campaign row
      return (data ?? []).map((c) => ({
        ...c,
        winner_variant: (c.ab_tests as { winner_variant: string | null } | null)?.winner_variant ?? null,
        ab_test_status: (c.ab_tests as { status: string | null } | null)?.status ?? null,
      }));
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useConversations(status?: string) {
  return useQuery({
    queryKey: ["conversations", status],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count, assigned_to,
          contacts (id, name, phone, tags, email, total_orders, total_spent, created_at, notes)
        `)
        .order("last_message_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
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
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!conversationId,
    staleTime: 15_000,
  });
}

export function useAnalytics(days = 30) {
  return useQuery({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data, error } = await analyticsQuery(userId)
        .gte("date", since)
        .order("date", { ascending: true });

      if (error) throw error;
      const rows = data ?? [];

      const totals = {
        messagesSent: rows.reduce((s, d) => s + d.messages_sent, 0),
        messagesDelivered: rows.reduce((s, d) => s + d.messages_delivered, 0),
        messagesRead: rows.reduce((s, d) => s + d.messages_read, 0),
        revenue: rows.reduce((s, d) => s + Number(d.revenue_influenced), 0),
        newContacts: rows.reduce((s, d) => s + d.new_contacts, 0),
      };

      const deliveryRate = totals.messagesSent > 0
        ? Math.round((totals.messagesDelivered / totals.messagesSent) * 100) : 0;
      const readRate = totals.messagesSent > 0
        ? Math.round((totals.messagesRead / totals.messagesSent) * 100) : 0;

      return {
        totals,
        deliveryRate,
        readRate,
        chartData: rows.map((d) => ({
          date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          enviadas: d.messages_sent,
          entregues: d.messages_delivered,
          lidas: d.messages_read,
          receita: Number(d.revenue_influenced),
          novos: d.new_contacts,
        })),
      };
    },
    staleTime: 60_000,
  });
}
