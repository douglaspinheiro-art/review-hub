import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { aggregateAnalyticsDailyRows, type AnalyticsDailyRow } from "@/lib/analytics-aggregate";
import {
  contactMatchesEnglishRfmSegment,
  RFM_ENGLISH_ALIASES,
  type RfmEnglishSegment,
} from "@/lib/rfm-segments";
import { scopeAttributionEventsForStore } from "@/lib/attribution-scope";
import { ATTRIBUTION_WINDOW_LABEL } from "@/lib/attribution-config";

/**
 * Resolve sessão + loja do tenant.
 * Se existir membership ativo em `team_members`, usa a loja do `account_owner_id` (colaborador).
 */
export async function getCurrentUserAndStore(): Promise<{
  userId: string | null;
  storeId: string | null;
  /** Dono dos dados (campanhas, contacts.user_id, etc.); igual a userId quando é proprietário. */
  effectiveUserId: string | null;
}> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) return { userId: null, storeId: null, effectiveUserId: null };

  const { data: membership } = await supabase
    .from("team_members")
    .select("account_owner_id")
    .eq("invited_user_id", userId)
    .eq("status", "active")
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const ownerId = (membership as { account_owner_id?: string } | null)?.account_owner_id;
  if (ownerId) {
    const { data: ownerStore } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return {
      userId,
      storeId: ownerStore?.id ?? null,
      effectiveUserId: ownerId,
    };
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { userId, storeId: store?.id ?? null, effectiveUserId: userId };
}

export function useDashboardStats(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard-stats", user?.id ?? null, days],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) throw new Error("Não autenticado");

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const customersQuery = storeId
        ? supabase.from("customers_v3").select("id", { count: "exact" }).eq("store_id", storeId)
        : supabase.from("contacts").select("id", { count: "exact" }).eq("user_id", effectiveUserId);

      const conversationsQuery = storeId
        ? supabase.from("conversations").select("id, status, unread_count", { count: "exact" }).eq("store_id", storeId)
        : supabase.from("conversations").select("id, status, unread_count", { count: "exact" }).eq("user_id", effectiveUserId);

      const campaignsQuery = storeId
        ? supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count").eq("store_id", storeId)
        : supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count").eq("user_id", effectiveUserId);

      // Each query in Promise.all must use an independently constructed builder.
      // Reusing the same Postgrest builder instance across parallel chains is unsafe
      // because the builder is mutated in-place and shared state causes incorrect filters.
      const buildAnalytics = () =>
        storeId
          ? supabase.from("analytics_daily").select("*").eq("store_id", storeId)
          : supabase.from("analytics_daily").select("*").eq("user_id", effectiveUserId);

      const buildOpportunities = () =>
        storeId
          ? supabase.from("opportunities").select("id", { count: "exact" }).eq("store_id", storeId)
          : supabase.from("opportunities").select("id", { count: "exact" }).eq("user_id", effectiveUserId);

      const [customersRes, conversationsRes, campaignsRes, analyticsRes, analyticsPrevRes, opportunitiesRes] = await Promise.all([
        customersQuery,
        conversationsQuery,
        campaignsQuery,
        buildAnalytics().gte("date", since).order("date", { ascending: true }),
        buildAnalytics().select("revenue_influenced").gte("date", prevSince).lt("date", since),
        buildOpportunities().neq("status", "resolvido"),
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
    enabled: !!user,
  });
}

export function useRecentConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recent-conversations", user?.id ?? null],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return [];

      let q = supabase
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count,
          contacts (id, name, phone, tags)
        `);
      q = storeId ? q.eq("store_id", storeId) : q.eq("user_id", effectiveUserId);
      const { data, error } = await q.order("last_message_at", { ascending: false }).limit(8);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    enabled: !!user,
  });
}

export type UseCampaignsOptions = { limit?: number };

export function useCampaigns(opts?: UseCampaignsOptions) {
  const { user } = useAuth();
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  return useQuery({
    queryKey: ["campaigns", user?.id ?? null, limit],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return [];

      // Each Promise.all entry needs its own builder instance to avoid shared mutable state.
      const [campaignsRes, sendsRes, attributionRes] = await Promise.all([
        (storeId
          ? supabase.from("campaigns").select("*").eq("store_id", storeId)
          : supabase.from("campaigns").select("*").eq("user_id", effectiveUserId)
        ).order("created_at", { ascending: false }).limit(limit),

        storeId
          ? supabase.from("message_sends").select("campaign_id,status").eq("store_id", storeId)
          : supabase.from("message_sends").select("campaign_id,status").eq("user_id", effectiveUserId),

        supabase.from("attribution_events").select("order_value,attributed_campaign_id").eq("user_id", effectiveUserId),
      ]);

      const { data, error } = campaignsRes;

      if (error) throw error;
      const campaigns = (data ?? []) as any[];
      const sends = (sendsRes.data ?? []) as Array<{ campaign_id: string | null; status: string | null }>;
      const attributionRaw = (attributionRes.data ?? []) as Array<{ order_value: number; attributed_campaign_id: string | null }>;
      const attribution = scopeAttributionEventsForStore(
        attributionRaw,
        storeId,
        campaigns.map((c) => c.id),
      );

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
    enabled: !!user,
  });
}

/** Colunas usadas na listagem e na amostra da Matriz RFM (classificação local). */
const CUSTOMERS_V3_LIST_COLUMNS =
  "id,name,email,phone,rfm_segment,tags,last_purchase_at,customer_health_score,unsubscribed_at,email_hard_bounce_at,email_complaint_at,created_at,rfm_frequency,rfm_monetary";

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type ContactsQueryResult = {
  contacts: unknown[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type UseContactsOptions = {
  /**
   * `sample` — até 500 linhas para a página Matriz RFM (sem busca/filtro no servidor).
   * `list` — paginação + busca ilike + filtro por `rfm_segment` no servidor.
   */
  variant?: "sample" | "list";
  page?: number;
  pageSize?: number;
  /** Texto de busca (nome, email, telefone); vírgulas são normalizadas para não quebrar o filtro OR. */
  search?: string;
  /** Filtro por aliases de segmento em `customers_v3.rfm_segment` (linhas sem segmento no banco não aparecem). */
  rfmSegment?: RfmEnglishSegment | null;
};

export function useContacts(options: UseContactsOptions = {}) {
  const variant = options.variant ?? "sample";
  const page = options.page ?? 1;
  const pageSize = variant === "sample" ? 500 : (options.pageSize ?? 50);
  const search =
    variant === "list"
      ? (options.search ?? "")
          .trim()
          .replace(/,/g, " ")
      : "";
  const rfmSegment = variant === "list" ? (options.rfmSegment ?? null) : null;

  const { user } = useAuth();
  return useQuery({
    queryKey: ["contacts", user?.id ?? null, variant, page, pageSize, search, rfmSegment],
    queryFn: async (): Promise<ContactsQueryResult> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) {
        return { contacts: [], totalCount: 0, page, pageSize };
      }

      let dataQuery = supabase.from("customers_v3").select(CUSTOMERS_V3_LIST_COLUMNS);
      dataQuery = storeId ? dataQuery.eq("store_id", storeId) : dataQuery.eq("user_id", effectiveUserId);

      let countQuery = supabase.from("customers_v3").select("id", { count: "exact", head: true });
      countQuery = storeId ? countQuery.eq("store_id", storeId) : countQuery.eq("user_id", effectiveUserId);

      if (variant === "list") {
        if (search.length > 0) {
          const esc = escapeIlikePattern(search);
          const p = `%${esc}%`;
          const orClause = `name.ilike.${p},email.ilike.${p},phone.ilike.${p}`;
          dataQuery = dataQuery.or(orClause);
          countQuery = countQuery.or(orClause);
        }
        if (rfmSegment) {
          const aliases = RFM_ENGLISH_ALIASES[rfmSegment];
          dataQuery = dataQuery.in("rfm_segment", aliases);
          countQuery = countQuery.in("rfm_segment", aliases);
        }
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        dataQuery = dataQuery.order("created_at", { ascending: false }).range(from, to);
      } else {
        dataQuery = dataQuery.order("created_at", { ascending: false }).limit(500);
      }

      const [{ data, error }, { count, error: countErr }] = await Promise.all([
        dataQuery,
        countQuery,
      ]);

      if (error) throw error;
      if (countErr) throw countErr;
      return {
        contacts: data ?? [],
        totalCount: count ?? 0,
        page,
        pageSize,
      };
    },
    staleTime: 60_000,
    enabled: !!user,
    placeholderData: variant === "list" ? keepPreviousData : undefined,
  });
}

const INBOX_CONV_PAGE_SIZE = 50;

export type InboxAssigneeFilter = "all" | "mine" | "unassigned";

export function useConversations(
  statusFilter = "all",
  opts?: { assigneeFilter?: InboxAssigneeFilter; mineAssigneeLabel?: string | null },
) {
  const { user } = useAuth();
  const assigneeFilter = opts?.assigneeFilter ?? "all";
  const mineLabel = (opts?.mineAssigneeLabel ?? "").trim();

  return useInfiniteQuery({
    queryKey: ["conversations", user?.id ?? null, statusFilter, assigneeFilter, mineLabel],
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return [];
      if (assigneeFilter === "mine" && !mineLabel) return [];

      let query = supabase
        .from("conversations")
        .select(`
          id, status, last_message, last_message_at, unread_count, assigned_to, assigned_to_name, priority, sla_due_at,
          contacts (id, name, phone, tags, total_orders, total_spent)
        `);
      query = storeId ? query.eq("store_id", storeId) : query.eq("user_id", effectiveUserId);
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (assigneeFilter === "unassigned") {
        // assigned_to_name existe na tabela; tipos gerados podem ficar desatualizados.
        query = (query as { is: (col: string, val: null) => typeof query }).is("assigned_to_name", null);
      } else if (assigneeFilter === "mine" && mineLabel) {
        query = (query as { eq: (col: string, val: string) => typeof query }).eq("assigned_to_name", mineLabel);
      }
      query = query.order("last_message_at", { ascending: false });
      const from = pageParam * INBOX_CONV_PAGE_SIZE;
      const to = from + INBOX_CONV_PAGE_SIZE - 1;
      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage, _all, lastPageParam) => {
      if (!lastPage.length || lastPage.length < INBOX_CONV_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
    staleTime: 20_000,
    refetchInterval: 45_000,
    enabled: !!user,
  });
}

export function useMessages(conversationId: string | null, limit = 200) {
  return useQuery({
    queryKey: ["messages", conversationId, limit],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(limit);
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
      const { data, error } = await supabase.rpc("search_conversation_ids_by_message", { p_search: q });
      if (error) throw error;
      const rows = (data ?? []) as { conversation_id: string }[];
      return rows.map((r) => r.conversation_id);
    },
    enabled: q.length >= 2,
    staleTime: 25_000,
  });
}

export function useInboxRoutingSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inbox_routing_settings", user?.id ?? null],
    queryFn: async () => {
      const { userId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return { agent_names: [] as string[], round_robin_index: 0 };

      const { data, error } = await supabase
        .from("inbox_routing_settings")
        .select("agent_names, round_robin_index")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (error) throw error;
      return {
        agent_names: (data?.agent_names as string[] | null) ?? [],
        round_robin_index: data?.round_robin_index ?? 0,
      };
    },
    staleTime: 60_000,
    enabled: !!user,
  });
}

export function useAnalytics(days = 30) {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: ["analytics", user?.id ?? null, days],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) throw new Error("Não autenticado");

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const query = storeId
        ? supabase.from("analytics_daily").select("*").eq("store_id", storeId)
        : supabase.from("analytics_daily").select("*").eq("user_id", effectiveUserId);

      const { data, error } = await query.gte("date", since).order("date", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as AnalyticsDailyRow[];
      return aggregateAnalyticsDailyRows(rows);
    },
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Último snapshot persistido de cenários de forecast (quando existir).
 * Passe `storeId` da loja atual para cache e RLS alinhados à loja (ex.: `useLoja().data?.id`).
 */
export function useForecastSnapshot(storeId: string | null | undefined) {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: ["forecast_snapshot", user?.id ?? null, storeId ?? null],
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from("forecast_snapshots")
        .select("*")
        .eq("store_id", storeId)
        .order("data_calculo", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 120_000,
    enabled: !authLoading && !!user && !!storeId,
    retry: 1,
  });
}

export function useConversionBaseline(days = 30) {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: ["conversion-baseline", user?.id ?? null, days],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) throw new Error("Não autenticado");

      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
      const prevSinceIso = new Date(Date.now() - days * 2 * 86_400_000).toISOString();

      // Each Promise.all entry needs its own builder to avoid shared mutable state.
      const buildSends = () =>
        storeId
          ? supabase.from("message_sends").select("status,created_at").eq("store_id", storeId)
          : supabase.from("message_sends").select("status,created_at").eq("user_id", effectiveUserId);

      /** Bases antigas (ex. fase1): só `sent_at`; outras migrações: `created_at`. PostgREST 400 se a coluna não existir. */
      const fetchSendsSince = async (since: string) => {
        const primary = await buildSends().gte("created_at", since);
        if (!primary.error) return primary;
        const fallback = storeId
          ? await supabase.from("message_sends").select("status,sent_at").eq("store_id", storeId).gte("sent_at", since)
          : await supabase.from("message_sends").select("status,sent_at").eq("user_id", effectiveUserId).gte("sent_at", since);
        if (!fallback.error) return fallback;
        console.warn("message_sends (baseline, since):", primary.error.message, fallback.error.message);
        return { data: [] as { status: string | null }[], error: null as null };
      };

      const fetchSendsPrevWindow = async () => {
        const primary = await buildSends().gte("created_at", prevSinceIso).lt("created_at", sinceIso);
        if (!primary.error) return primary;
        const fallback = storeId
          ? await supabase
              .from("message_sends")
              .select("status,sent_at")
              .eq("store_id", storeId)
              .gte("sent_at", prevSinceIso)
              .lt("sent_at", sinceIso)
          : await supabase
              .from("message_sends")
              .select("status,sent_at")
              .eq("user_id", effectiveUserId)
              .gte("sent_at", prevSinceIso)
              .lt("sent_at", sinceIso);
        if (!fallback.error) return fallback;
        console.warn("message_sends (baseline, prev window):", primary.error.message, fallback.error.message);
        return { data: [] as { status: string | null }[], error: null as null };
      };

      const fetchConversationsBaseline = async () => {
        const full = storeId
          ? supabase.from("conversations").select("id,sla_due_at,last_message_at,priority,status").eq("store_id", storeId)
          : supabase.from("conversations").select("id,sla_due_at,last_message_at,priority,status").eq("user_id", effectiveUserId);
        const fullRes = await full;
        if (!fullRes.error) return fullRes;
        const minimal = storeId
          ? supabase.from("conversations").select("id,last_message_at,status").eq("store_id", storeId)
          : supabase.from("conversations").select("id,last_message_at,status").eq("user_id", effectiveUserId);
        const minRes = await minimal;
        if (!minRes.error) return minRes;
        console.warn("conversations (baseline):", fullRes.error.message, minRes.error.message);
        return { data: [] as Record<string, unknown>[], error: null as null };
      };

      const [sendsRes, sendsPrevRes, conversationsRes, attributionRes, campaignsScopeRes] = await Promise.all([
        fetchSendsSince(sinceIso),
        fetchSendsPrevWindow(),
        fetchConversationsBaseline(),
        supabase.from("attribution_events").select("order_value,order_date,attributed_campaign_id").eq("user_id", effectiveUserId).gte("order_date", sinceIso),
        storeId
          ? supabase.from("campaigns").select("id").eq("store_id", storeId)
          : supabase.from("campaigns").select("id").eq("user_id", effectiveUserId),
      ]);

      const sends = sendsRes.data ?? [];
      const sendsPrev = sendsPrevRes.data ?? [];
      /** Resposta pode vir de selects diferentes (fallback); tratar como linhas genéricas. */
      const conversations = (conversationsRes.data ?? []) as {
        sla_due_at?: string | null;
        priority?: string | null;
        last_message_at?: string | null;
        status?: string;
        id?: string;
      }[];
      const storeCampaignIds = (campaignsScopeRes.data ?? []).map((r: { id: string }) => r.id);
      const attribution = scopeAttributionEventsForStore(
        attributionRes.data ?? [],
        storeId,
        storeCampaignIds,
      );

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
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useROIAttribution(days = 30) {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: ["roi-attribution", days, user?.id ?? null],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return null;

      const since = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
      const prevSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString().split("T")[0];
      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

      // Each builder must be constructed fresh per query in Promise.all.
      const buildAnalyticsROI = () =>
        storeId
          ? supabase.from("analytics_daily").select("*").eq("store_id", storeId)
          : supabase.from("analytics_daily").select("*").eq("user_id", effectiveUserId);

      const [analyticsRes, analyticsPrevRes, cartsRes, campaignsRes, attributionRes] = await Promise.all([
        buildAnalyticsROI().gte("date", since).order("date", { ascending: true }),
        buildAnalyticsROI().select("revenue_influenced").gte("date", prevSince).lt("date", since),

        (storeId
          ? supabase.from("abandoned_carts").select("status,cart_value,recovered_at,campaign_id,automation_id").eq("store_id", storeId)
          : supabase.from("abandoned_carts").select("status,cart_value,recovered_at,campaign_id,automation_id").eq("user_id", effectiveUserId)
        ).gte("created_at", sinceIso),

        storeId
          ? supabase.from("campaigns").select("id,name,channel,sent_count,custo_total_envio").eq("store_id", storeId)
          : supabase.from("campaigns").select("id,name,channel,sent_count,custo_total_envio").eq("user_id", effectiveUserId),

        supabase
          .from("attribution_events")
          .select("order_value,attributed_campaign_id,attributed_automation_id")
          .eq("user_id", effectiveUserId)
          .gte("order_date", sinceIso),
      ]);

      if (analyticsRes.error) throw new Error(analyticsRes.error.message);
      if (campaignsRes.error) throw new Error(campaignsRes.error.message);

      const analytics = analyticsRes.data ?? [];
      const carts = cartsRes.data ?? [];
      const campaigns = (campaignsRes.data ?? []) as Array<{
        id: string;
        name: string;
        channel: string;
        sent_count: number | null;
        custo_total_envio?: number | null;
      }>;
      const attributionQueryError = attributionRes.error?.message ?? null;
      const attributionRowsRaw = attributionRes.error ? [] : (attributionRes.data ?? []);
      const attribution = scopeAttributionEventsForStore(
        attributionRowsRaw,
        storeId,
        campaigns.map((c) => c.id),
      );

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

      const totalSpendBrl = campaigns.reduce((s, c) => s + Number(c.custo_total_envio ?? 0), 0);
      const roas = totalSpendBrl > 0 && totalRevenue > 0 ? totalRevenue / totalSpendBrl : null;
      const roasDenominatorMissing = totalSpendBrl <= 0;

      return {
        totalRevenue,
        revGrowth,
        roas,
        totalSpendBrl,
        roasDenominatorMissing,
        attributionWindowLabel: ATTRIBUTION_WINDOW_LABEL,
        attributionQueryError,
        usesEstimatedSourceSplit: !hasAttribution,
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
          date: new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            timeZone: "America/Sao_Paulo",
          }),
          receita: Number(d.revenue_influenced),
        })),
      };
    },
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export type RfmReportCounts = {
  champions: number;
  loyal: number;
  at_risk: number;
  lost: number;
  new: number;
  other: number;
  total: number;
  avgChs: number | null;
};

/** Contagens RFM + CHS médio a partir de `customers_v3` (mesma loja/conta que o resto do dashboard). */
export function useRfmReportCounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rfm-report-counts", user?.id ?? null],
    queryFn: async (): Promise<RfmReportCounts | null> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return null;

      const base = storeId
        ? supabase.from("customers_v3").select("rfm_segment, customer_health_score").eq("store_id", storeId)
        : supabase.from("customers_v3").select("rfm_segment, customer_health_score").eq("user_id", effectiveUserId);

      const { data, error } = await base;
      if (error) throw error;

      const list = (data ?? []) as { rfm_segment: string | null; customer_health_score: number | null }[];
      const c: RfmReportCounts = {
        champions: 0,
        loyal: 0,
        at_risk: 0,
        lost: 0,
        new: 0,
        other: 0,
        total: list.length,
        avgChs: null,
      };
      let chsSum = 0;
      let chsN = 0;

      for (const r of list) {
        if (r.customer_health_score != null && !Number.isNaN(Number(r.customer_health_score))) {
          chsSum += Number(r.customer_health_score);
          chsN++;
        }
        const raw = r.rfm_segment;
        let matched = false;
        if (contactMatchesEnglishRfmSegment(raw, "champions")) {
          c.champions++;
          matched = true;
        }
        if (contactMatchesEnglishRfmSegment(raw, "loyal")) {
          c.loyal++;
          matched = true;
        }
        if (contactMatchesEnglishRfmSegment(raw, "at_risk")) {
          c.at_risk++;
          matched = true;
        }
        if (contactMatchesEnglishRfmSegment(raw, "lost")) {
          c.lost++;
          matched = true;
        }
        if (contactMatchesEnglishRfmSegment(raw, "new")) {
          c.new++;
          matched = true;
        }
        if (!matched) c.other++;
      }
      c.avgChs = chsN > 0 ? Math.round(chsSum / chsN) : null;
      return c;
    },
    staleTime: 60_000,
    enabled: !!user,
  });
}

export type CustomerCohortRow = {
  id: string;
  cohort_month: string;
  cohort_size: number;
  retention_d30: number | null;
  computed_at: string;
};

/** Snapshots de cohort gerados pelo pipeline (`customer_cohorts`). */
export function useCustomerCohorts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["customer-cohorts", user?.id ?? null],
    queryFn: async (): Promise<CustomerCohortRow[]> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return [];

      const q = storeId
        ? supabase.from("customer_cohorts").select("id, cohort_month, cohort_size, retention_d30, computed_at").eq("store_id", storeId)
        : supabase.from("customer_cohorts").select("id, cohort_month, cohort_size, retention_d30, computed_at").eq("user_id", effectiveUserId);

      const { data, error } = await q.order("cohort_month", { ascending: false }).limit(36);
      if (error) return [];
      return (data ?? []) as CustomerCohortRow[];
    },
    staleTime: 120_000,
    enabled: !!user,
  });
}

export type MessageSendHeatmap = {
  /** chave `${dayIndex}-${bucket}` com dayIndex 0=Seg … 6=Dom */
  cells: Record<string, number>;
  max: number;
};

/** Agrega envios por dia da semana e faixa horária (últimos `days`). */
export function useMessageSendHeatmap(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["message-send-heatmap", user?.id ?? null, days],
    queryFn: async (): Promise<MessageSendHeatmap> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return { cells: {}, max: 0 };

      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
      const base = storeId
        ? supabase.from("message_sends").select("sent_at").eq("store_id", storeId).gte("sent_at", sinceIso)
        : supabase.from("message_sends").select("sent_at").eq("user_id", effectiveUserId).gte("sent_at", sinceIso);

      const { data, error } = await base.limit(8000);
      if (error) return { cells: {}, max: 0 };

      const cells: Record<string, number> = {};
      let max = 0;
      for (const row of data ?? []) {
        const d = new Date((row as { sent_at: string }).sent_at);
        const jsDow = d.getDay();
        const dayIndex = jsDow === 0 ? 6 : jsDow - 1;
        const hour = d.getHours();
        let bucket: string;
        if (hour < 11) bucket = "08h";
        else if (hour < 15) bucket = "12h";
        else bucket = "18h";
        const key = `${dayIndex}-${bucket}`;
        cells[key] = (cells[key] ?? 0) + 1;
        if (cells[key] > max) max = cells[key];
      }
      return { cells, max };
    },
    staleTime: 60_000,
    enabled: !!user && days > 0,
  });
}

export function useProblems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["problems", user?.id ?? null],
    queryFn: async () => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) return [];

      const query = storeId
        ? supabase.from("opportunities").select("*").eq("store_id", storeId)
        : supabase.from("opportunities").select("*").eq("user_id", effectiveUserId);

      const { data, error } = await query
        .neq("status", "resolvido")
        .neq("status", "ignorado")
        .order("detected_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: !!user,
  });
}
