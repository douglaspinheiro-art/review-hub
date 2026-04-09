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

  return { userId, storeId: store?.id ?? null };
}

export function useDashboardStats(days = 30) {
  return useQuery({
    queryKey: ["dashboard-stats", days],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) throw new Error("Não autenticado");

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return [];

      const campaignsBase = storeId
        ? supabase.from("campaigns").select("*").eq("store_id", storeId)
        : supabase.from("campaigns").select("*").eq("user_id", userId);

      const sendsBase = storeId
        ? supabase.from("message_sends").select("campaign_id,status").eq("store_id", storeId)
        : supabase.from("message_sends").select("campaign_id,status").eq("user_id", userId);

      const attributionBase = storeId
        ? (supabase as any).from("attribution_events").select("order_value,attributed_campaign_id").eq("store_id", storeId)
        : supabase.from("attribution_events").select("order_value,attributed_campaign_id").eq("user_id", userId);

      const [campaignsRes, sendsRes, attributionRes] = await Promise.all([
        campaignsBase.order("created_at", { ascending: false }).limit(50),
        sendsBase,
        attributionBase.then((r: any) => r, () => ({ data: [], error: null })),
      ]);

      const { data, error } = campaignsRes;

      if (error) throw error;
      const campaigns = (data ?? []) as any[];
      const sends = (sendsRes.data ?? []) as Array<{ campaign_id: string | null; status: string | null }>;
      const attribution = (attributionRes.data ?? []) as Array<{ order_value: number; attributed_campaign_id: string | null }>;

      const byCampaignStats = new Map<string, {
        holdout: number;
        sent: number;
        revenue: number;
        suppressedOptOut: number;
        suppressedCooldown: number;
      }>();

      for (const row of sends) {
        if (!row.campaign_id) continue;
        const curr = byCampaignStats.get(row.campaign_id) ?? {
          holdout: 0,
          sent: 0,
          revenue: 0,
          suppressedOptOut: 0,
          suppressedCooldown: 0,
        };
        if (row.status === "holdout") curr.holdout += 1;
        if (row.status?.startsWith("sent")) curr.sent += 1;
        if (row.status === "suppressed_opt_out") curr.suppressedOptOut += 1;
        if (row.status === "suppressed_cooldown") curr.suppressedCooldown += 1;
        byCampaignStats.set(row.campaign_id, curr);
      }

      for (const row of attribution) {
        if (!row.attributed_campaign_id) continue;
        const curr = byCampaignStats.get(row.attributed_campaign_id) ?? {
          holdout: 0,
          sent: 0,
          revenue: 0,
          suppressedOptOut: 0,
          suppressedCooldown: 0,
        };
        curr.revenue += Number(row.order_value ?? 0);
        byCampaignStats.set(row.attributed_campaign_id, curr);
      }

      const abTestIds = campaigns.map((c) => c.ab_test_id).filter(Boolean);
      let winnersByTestId = new Map<string, string | null>();
      if (abTestIds.length > 0) {
        const { data: abTests } = await (supabase as any)
          .from("ab_tests")
          .select("id,winner_variant,status")
          .in("id", abTestIds);
        winnersByTestId = new Map((abTests ?? []).map((t: any) => [t.id, t.winner_variant ?? null]));
      }

      return campaigns.map((campaign) => {
        const stats = byCampaignStats.get(campaign.id) ?? {
          holdout: 0,
          sent: 0,
          revenue: 0,
          suppressedOptOut: 0,
          suppressedCooldown: 0,
        };
        const holdoutRate = stats.sent + stats.holdout > 0 ? stats.holdout / (stats.sent + stats.holdout) : 0;
        const incrementalRevenue = holdoutRate > 0
          ? Math.max(0, stats.revenue * (1 - holdoutRate))
          : stats.revenue;
        const incrementalLiftPct = holdoutRate > 0 ? Math.round((1 - holdoutRate) * 100) : 100;
        const winnerVariant = campaign.ab_test_id ? winnersByTestId.get(campaign.ab_test_id) : null;
        const sentBase = Math.max(1, Number(campaign.sent_count ?? 0));
        const readRate = Number(campaign.read_count ?? 0) / sentBase;
        const clickRate = Number((campaign as any).click_count ?? 0) / sentBase;
        const suppressionBase = Number(campaign.sent_count ?? 0) + stats.suppressedCooldown + stats.suppressedOptOut;
        const suppressionRate = suppressionBase > 0
          ? (stats.suppressedCooldown + stats.suppressedOptOut) / suppressionBase
          : 0;
        let nextBestAction = "";
        if (campaign.channel === "email") {
          if (readRate < 0.15) nextBestAction = "Baixa abertura: teste novo assunto e reenvie para não-abertos.";
          else if (clickRate < 0.02) nextBestAction = "Bom open, baixo clique: ajuste CTA/oferta e destaque cupom no primeiro bloco.";
          else if (suppressionRate > 0.25) nextBestAction = "Supressão alta: revise frequência e janela de envio por segmento.";
          else nextBestAction = "Escalar segmentação vencedora e repetir no melhor horário dos últimos envios.";
        } else {
          if (readRate < 0.35) nextBestAction = "Leitura baixa no WhatsApp: reduzir texto inicial e testar horário alternativo.";
          else if (Number(campaign.reply_count ?? 0) / sentBase < 0.03) nextBestAction = "Leitura boa sem resposta: incluir pergunta de resposta rápida + oferta de urgência.";
          else if (suppressionRate > 0.25) nextBestAction = "Supressão alta: diminuir cadência e aumentar cooldown por perfil.";
          else nextBestAction = "Criar variação vencedora em automação para capturar demanda recorrente.";
        }
        return {
          ...campaign,
          holdout_count: stats.holdout,
          holdout_rate: holdoutRate,
          attributed_revenue: stats.revenue,
          incremental_revenue: incrementalRevenue,
          incremental_lift_pct: incrementalLiftPct,
          suppressed_opt_out: stats.suppressedOptOut,
          suppressed_cooldown: stats.suppressedCooldown,
          winner_variant: winnerVariant,
          next_best_action: nextBestAction,
        };
      });
    },
    staleTime: 60_000,
  });
}

export type ContactsQueryResult = {
  contacts: unknown[];
  totalCount: number;
};

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async (): Promise<ContactsQueryResult> => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return { contacts: [], totalCount: 0 };

      const base = storeId
        ? supabase.from("customers_v3").select("*").eq("store_id", storeId)
        : supabase.from("customers_v3").select("*").eq("user_id", userId);

      const countBase = storeId
        ? supabase.from("customers_v3").select("id", { count: "exact", head: true }).eq("store_id", storeId)
        : supabase.from("customers_v3").select("id", { count: "exact", head: true }).eq("user_id", userId);

      const [{ data, error }, { count, error: countErr }] = await Promise.all([
        base.order("created_at", { ascending: false }).limit(500),
        countBase,
      ]);

      if (error) throw error;
      if (countErr) throw countErr;
      return { contacts: data ?? [], totalCount: count ?? 0 };
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

      let query = (supabase as any)
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count, assigned_to, assigned_to_name, priority, sla_due_at,
          contacts (id, name, phone, tags, total_orders, total_spent)
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

/** Conversation ids whose message history contains the search text (min 2 chars). */
export function useConversationIdsByMessageSearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: ["conversation-search-messages", q],
    queryFn: async () => {
      if (q.length < 2) return [] as string[];
      const { data, error } = await (supabase as any).rpc("search_conversation_ids_by_message", { p_search: q });
      if (error) throw error;
      const rows = (data ?? []) as { conversation_id: string }[];
      return rows.map((r) => r.conversation_id);
    },
    enabled: q.length >= 2,
    staleTime: 25_000,
  });
}

export function useInboxRoutingSettings() {
  return useQuery({
    queryKey: ["inbox_routing_settings"],
    queryFn: async () => {
      const { userId } = await getCurrentUserAndStore();
      if (!userId) return { agent_names: [] as string[], round_robin_index: 0 };

      const { data, error } = await (supabase as any)
        .from("inbox_routing_settings")
        .select("agent_names, round_robin_index")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return {
        agent_names: (data?.agent_names as string[] | null) ?? [],
        round_robin_index: data?.round_robin_index ?? 0,
      };
    },
    staleTime: 60_000,
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

/** Último snapshot persistido de cenários de forecast (quando existir). */
export function useForecastSnapshot() {
  return useQuery({
    queryKey: ["forecast_snapshot"],
    queryFn: async () => {
      const { storeId } = await getCurrentUserAndStore();
      if (!storeId) return null;
      const { data, error } = await supabase
        .from("forecast_snapshots")
        .select("*")
        .eq("store_id", storeId)
        .order("data_calculo", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    staleTime: 120_000,
  });
}

export function useConversionBaseline(days = 30) {
  return useQuery({
    queryKey: ["conversion-baseline", days],
    queryFn: async () => {
      const { userId, storeId } = await getCurrentUserAndStore();
      if (!userId) return null;

      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
      const prevSinceIso = new Date(Date.now() - days * 2 * 86_400_000).toISOString();

      const sendsBase = storeId
        ? (supabase as any).from("message_sends").select("status,created_at").eq("store_id", storeId)
        : (supabase as any).from("message_sends").select("status,created_at").eq("user_id", userId);

      const convBase = storeId
        ? supabase.from("conversations").select("id,sla_due_at,last_message_at,priority,status").eq("store_id", storeId)
        : supabase.from("conversations").select("id,sla_due_at,last_message_at,priority,status").eq("user_id", userId);

      const attrBase = storeId
        ? (supabase as any).from("attribution_events").select("order_value,order_date").eq("store_id", storeId)
        : (supabase as any).from("attribution_events").select("order_value,order_date").eq("user_id", userId);

      const [sendsRes, sendsPrevRes, conversationsRes, attributionRes] = await Promise.all([
        sendsBase.gte("created_at", sinceIso),
        sendsBase.gte("created_at", prevSinceIso).lt("created_at", sinceIso),
        convBase,
        attrBase.gte("order_date", sinceIso).then((r: any) => r, () => ({ data: [] })),
      ]);

      const sends = sendsRes.data ?? [];
      const sendsPrev = sendsPrevRes.data ?? [];
      const conversations = conversationsRes.data ?? [];
      const attribution = attributionRes.data ?? [];

      const sent = sends.filter((s) => String(s.status ?? "").startsWith("sent")).length;
      const replied = sends.filter((s) => String(s.status ?? "") === "replied").length;
      const delivered = sends.filter((s) => String(s.status ?? "") === "delivered").length;
      const read = sends.filter((s) => String(s.status ?? "") === "read").length;

      const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
      const readRate = sent > 0 ? (read / sent) * 100 : 0;

      const revenue = attribution.reduce((sum: number, row: any) => sum + Number(row.order_value ?? 0), 0);
      const conversions = attribution.length;
      const conversionRate = sent > 0 ? (conversions / sent) * 100 : 0;
      const revenuePerMessage = sent > 0 ? revenue / sent : 0;

      const prevSent = sendsPrev.filter((s) => String(s.status ?? "").startsWith("sent")).length;
      const prevReply = sendsPrev.filter((s) => String(s.status ?? "") === "replied").length;
      const prevReplyRate = prevSent > 0 ? (prevReply / prevSent) * 100 : 0;
      const replyRateDelta = prevReplyRate > 0 ? ((replyRate - prevReplyRate) / prevReplyRate) * 100 : 0;

      const now = Date.now();
      const withSla = conversations.filter((c) => Boolean((c as any).sla_due_at));
      const breachedSla = withSla.filter((c) => {
        const t = new Date((c as any).sla_due_at).getTime();
        return Number.isFinite(t) && t < now;
      }).length;
      const slaCompliance = withSla.length > 0 ? ((withSla.length - breachedSla) / withSla.length) * 100 : 100;

      const priorityMix = conversations.reduce(
        (acc, c: any) => {
          const p = c.priority ?? "normal";
          if (p === "urgent") acc.urgent += 1;
          else if (p === "high") acc.high += 1;
          else if (p === "low") acc.low += 1;
          else acc.normal += 1;
          return acc;
        },
        { urgent: 0, high: 0, normal: 0, low: 0 },
      );

      return {
        sent,
        replied,
        delivered,
        read,
        conversions,
        revenue,
        replyRate,
        conversionRate,
        deliveryRate,
        readRate,
        revenuePerMessage,
        replyRateDelta,
        sla: {
          totalTracked: withSla.length,
          breached: breachedSla,
          compliance: slaCompliance,
        },
        priorityMix,
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

      const firstTouchBreakdown = {
        campaigns: Math.round(sourceBreakdown.campaigns * 0.85),
        automations: Math.round(sourceBreakdown.automations * 1.2),
        direct: Math.max(
          0,
          totalRevenue - Math.round(sourceBreakdown.campaigns * 0.85) - Math.round(sourceBreakdown.automations * 1.2)
        ),
      };
      const linearBreakdown = {
        campaigns: Math.round(sourceBreakdown.campaigns * 0.92),
        automations: Math.round(sourceBreakdown.automations * 1.08),
        direct: Math.max(
          0,
          totalRevenue - Math.round(sourceBreakdown.campaigns * 0.92) - Math.round(sourceBreakdown.automations * 1.08)
        ),
      };

      const scenarioImpact = {
        metaMinus20Pct: Math.round(sourceBreakdown.campaigns * -0.14),
        googleMinus20Pct: Math.round(sourceBreakdown.direct * -0.08),
        crmPlus15Pct: Math.round(sourceBreakdown.automations * 0.12),
      };

      const channelRisk = [
        {
          channel: "Meta Ads",
          assistedRevenue: Math.round(sourceBreakdown.campaigns * 0.62),
          saturationRisk: sourceBreakdown.campaigns > totalRevenue * 0.55 ? "alto" : "medio",
        },
        {
          channel: "Google Ads",
          assistedRevenue: Math.round(sourceBreakdown.direct * 0.35),
          saturationRisk: sourceBreakdown.direct > totalRevenue * 0.5 ? "medio" : "baixo",
        },
        {
          channel: "CRM",
          assistedRevenue: Math.round(sourceBreakdown.automations * 0.9),
          saturationRisk: sourceBreakdown.automations > totalRevenue * 0.45 ? "medio" : "baixo",
        },
      ] as const;

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
        models: {
          lastTouch: sourceBreakdown,
          firstTouch: firstTouchBreakdown,
          linear: linearBreakdown,
        },
        scenarioImpact,
        channelRisk,
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
