import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { pickStoreIdFromList } from "@/lib/active-store-id";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import { aggregateAnalyticsDailyRows, type AnalyticsDailyRow } from "@/lib/analytics-aggregate";
import {
  contactMatchesEnglishRfmSegment,
  RFM_ENGLISH_ALIASES,
  type RfmEnglishSegment,
} from "@/lib/rfm-segments";
import { scopeAttributionEventsForStore } from "@/lib/attribution-scope";
import { ATTRIBUTION_WINDOW_LABEL } from "@/lib/attribution-config";
import type { Database } from "@/integrations/supabase/types";
import {
  extendLegacyDashboardStats,
  mapDashboardSnapshotRpcToHomeStats,
  type DashboardHomeStats,
} from "@/lib/dashboard-home-stats";
import { CAMPAIGN_LIST_SELECT, OPPORTUNITIES_LIST_SELECT } from "@/lib/supabase-select-fragments";
import { CHART_SERIES_MAX_POINTS, downsampleDailySeriesBySum } from "@/lib/chart-downsample";

const ANALYTICS_DAILY_LIST_COLUMNS =
  "id,date,store_id,user_id,revenue_influenced,messages_sent,messages_delivered,messages_read,new_contacts,active_conversations,created_at";

async function fetchLegacyConversationKpis(
  storeId: string | null,
  effectiveUserId: string,
): Promise<{ openConversations: number; totalUnread: number }> {
  try {
    const { data, error } = await supabase.rpc("get_legacy_dashboard_conversation_kpis", {
      p_store_id: storeId,
      p_user_id: effectiveUserId,
    });
    if (error) throw error;
    const row = data as { open_count?: unknown; unread_sum?: unknown } | null;
    return {
      openConversations: Number(row?.open_count ?? 0),
      totalUnread: Number(row?.unread_sum ?? 0),
    };
  } catch {
    const convQuery = storeId
      ? supabase.from("conversations").select("id, status, unread_count", { count: "exact" }).eq("store_id", storeId)
      : supabase.from("conversations").select("id, status, unread_count", { count: "exact" }).eq("user_id", effectiveUserId);
    const { data, error } = await convQuery;
    if (error) throw error;
    const rows = data ?? [];
    return {
      openConversations: rows.filter((c) => c.status === "open").length,
      totalUnread: rows.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
    };
  }
}

export type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];

/** Linha de campanha na listagem (tabela + métricas agregadas na query). */
export type CampaignListItem = Database["public"]["Tables"]["campaigns"]["Row"] & {
  /** Máximo entre `sent_count` da linha e envios agregados em `message_sends` (melhor para progresso na UI). */
  aggregated_sent_count: number;
  ab_test_id?: string | null;
  ab_variant?: string | null;
  holdout_count: number;
  holdout_rate: number;
  attributed_revenue: number;
  incremental_revenue: number;
  incremental_lift_pct: number;
  suppressed_opt_out: number;
  suppressed_cooldown: number;
  winner_variant: string | null;
  next_best_action: string;
};

/**
 * Resolve sessão + loja do tenant.
 * Se existir membership ativo em `team_members`, usa a loja do `account_owner_id` (colaborador).
 */
export async function getCurrentUserAndStore(storeIdHint?: string | null): Promise<{
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
  const effectiveUserId = ownerId ?? userId;

  const { data: stores, error } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ids = (stores ?? []).map((r) => r.id as string);
  const storeId = pickStoreIdFromList(ids, storeIdHint ?? null);

  return { userId, storeId, effectiveUserId };
}

/** Agregação legada (várias queries) — usada sem `store_id` ou como fallback se o RPC falhar. */
export async function fetchDashboardStatsLegacyData(days: number) {
  const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
  if (!userId || !effectiveUserId) throw new Error("Não autenticado");

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const customersQuery = storeId
    ? supabase.from("customers_v3").select("id", { count: "exact", head: true }).eq("store_id", storeId)
    : supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId);

  const campaignsQuery = storeId
    ? supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count").eq("store_id", storeId)
    : supabase.from("campaigns").select("id, status, sent_count, delivered_count, read_count").eq("user_id", effectiveUserId);

  const buildAnalytics = () =>
    storeId
      ? supabase.from("analytics_daily").select(ANALYTICS_DAILY_LIST_COLUMNS).eq("store_id", storeId)
      : supabase.from("analytics_daily").select(ANALYTICS_DAILY_LIST_COLUMNS).eq("user_id", effectiveUserId);

  const buildOpportunities = () =>
    storeId
      ? supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("store_id", storeId)
      : supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId);

  const [customersRes, convKpis, campaignsRes, analyticsRes, analyticsPrevRes, opportunitiesRes] = await Promise.all([
    customersQuery,
    fetchLegacyConversationKpis(storeId, effectiveUserId),
    campaignsQuery,
    buildAnalytics().gte("date", since).order("date", { ascending: true }),
    buildAnalytics().select("revenue_influenced").gte("date", prevSince).lt("date", since),
    buildOpportunities().neq("status", "resolvido").neq("status", "ignorado"),
  ]);

  const analytics = analyticsRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];

  const totalContacts = customersRes.count ?? 0;
  const openConversations = convKpis.openConversations;
  const totalUnread = convKpis.totalUnread;

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
    chartData: downsampleDailySeriesBySum(
      analytics.map((d) => ({
        date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        enviadas: d.messages_sent,
        entregues: d.messages_delivered,
        lidas: d.messages_read,
        receita: Number(d.revenue_influenced),
      })),
      ["enviadas", "entregues", "lidas", "receita"],
      CHART_SERIES_MAX_POINTS,
    ),
  };
}

export function useDashboardStats(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard-stats", user?.id ?? null, days],
    queryFn: () => fetchDashboardStatsLegacyData(days),
    staleTime: 60_000,
    enabled: !!user,
  });
}

/** Métricas unificadas da home: RPC `get_dashboard_snapshot` com fallback legado. */
export function useDashboardHomeStats(period: 7 | 30 | 90) {
  const { user, loading: authLoading } = useAuth();
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  return useQuery({
    queryKey: ["dashboard-home-stats", user?.id ?? null, period, storeKey],
    queryFn: async (): Promise<DashboardHomeStats> => {
      const { storeId } = await getCurrentUserAndStore(scope?.activeStoreId);
      if (storeId) {
        try {
          const { data, error } = await supabase.rpc("get_dashboard_snapshot", {
            p_store_id: storeId,
            p_period_days: period,
          });
          if (error) throw error;
          if (data != null) return mapDashboardSnapshotRpcToHomeStats(data);
        } catch (e) {
          console.warn("[useDashboardHomeStats] RPC get_dashboard_snapshot indisponível ou erro — fallback legado", e);
        }
      }
      const legacy = await fetchDashboardStatsLegacyData(period);
      return extendLegacyDashboardStats(legacy);
    },
    staleTime: 60_000,
    enabled: !authLoading && !!user,
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

export type UseCampaignsOptions = { limit?: number; createdSince?: string | null };

type CampaignSendAggRow = {
  campaign_id: string;
  holdout: number;
  sent_n: number;
  suppressed_opt_out: number;
  suppressed_cooldown: number;
};
type CampaignRevRow = { campaign_id: string; revenue: number };

const CAMPAIGN_METRICS_FALLBACK_CHUNK = 40;

async function fetchCampaignMetricsBundle(
  storeId: string | null,
  effectiveUserId: string,
  campaignIds: string[],
): Promise<Map<string, { holdout: number; sent: number; revenue: number; suppressedOptOut: number; suppressedCooldown: number }>> {
  const empty = () =>
    new Map<string, { holdout: number; sent: number; revenue: number; suppressedOptOut: number; suppressedCooldown: number }>();
  if (campaignIds.length === 0) return empty();

  const { data: bundle, error } = await supabase.rpc("get_campaign_metrics_bundle", {
    p_store_id: storeId,
    p_owner_user_id: effectiveUserId,
    p_campaign_ids: campaignIds,
  });

  const byCampaignStats = empty();
  if (!error && bundle && typeof bundle === "object") {
    const b = bundle as { sends?: CampaignSendAggRow[]; revenue?: CampaignRevRow[] };
    for (const row of b.sends ?? []) {
      if (!row?.campaign_id) continue;
      byCampaignStats.set(row.campaign_id, {
        holdout: Number(row.holdout ?? 0),
        sent: Number(row.sent_n ?? 0),
        revenue: 0,
        suppressedOptOut: Number(row.suppressed_opt_out ?? 0),
        suppressedCooldown: Number(row.suppressed_cooldown ?? 0),
      });
    }
    for (const row of b.revenue ?? []) {
      if (!row?.campaign_id) continue;
      const curr = byCampaignStats.get(row.campaign_id) ?? {
        holdout: 0,
        sent: 0,
        revenue: 0,
        suppressedOptOut: 0,
        suppressedCooldown: 0,
      };
      curr.revenue += Number(row.revenue ?? 0);
      byCampaignStats.set(row.campaign_id, curr);
    }
    return byCampaignStats;
  }

  if (error) {
    console.warn(
      "[fetchCampaignMetricsBundle] RPC get_campaign_metrics_bundle falhou — agregação em lotes no browser.",
      error.message,
    );
  }

  const attributionRawAll: Array<{ order_value: number; attributed_campaign_id: string | null }> = [];

  for (let off = 0; off < campaignIds.length; off += CAMPAIGN_METRICS_FALLBACK_CHUNK) {
    const chunk = campaignIds.slice(off, off + CAMPAIGN_METRICS_FALLBACK_CHUNK);
    if (chunk.length === 0) continue;

    const sendsQ = storeId
      ? supabase.from("message_sends").select("campaign_id,status").eq("store_id", storeId).in("campaign_id", chunk)
      : supabase.from("message_sends").select("campaign_id,status").eq("user_id", effectiveUserId).in("campaign_id", chunk);
    const attrQ = supabase
      .from("attribution_events")
      .select("order_value,attributed_campaign_id")
      .eq("user_id", effectiveUserId)
      .in("attributed_campaign_id", chunk);

    const [sendsRes, attributionRes] = await Promise.all([sendsQ, attrQ]);
    if (sendsRes.error) throw sendsRes.error;
    if (attributionRes.error) throw attributionRes.error;

    const sends = (sendsRes.data ?? []) as Array<{ campaign_id: string | null; status: string | null }>;
    attributionRawAll.push(...((attributionRes.data ?? []) as Array<{ order_value: number; attributed_campaign_id: string | null }>));

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
  }

  const attribution = scopeAttributionEventsForStore(attributionRawAll, storeId, campaignIds);
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
  return byCampaignStats;
}

export function useCampaigns(opts?: UseCampaignsOptions) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 50));
  const createdSince = opts?.createdSince?.trim() || null;
  return useQuery({
    queryKey: ["campaigns", user?.id ?? null, limit, createdSince ?? "", storeKey],
    queryFn: async (): Promise<CampaignListItem[]> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore(scope?.activeStoreId);
      if (!userId || !effectiveUserId) return [];

      const baseCampaignsQuery = storeId
        ? supabase.from("campaigns").select(CAMPAIGN_LIST_SELECT).eq("store_id", storeId)
        : supabase.from("campaigns").select(CAMPAIGN_LIST_SELECT).eq("user_id", effectiveUserId);
      const campaignsQuery = createdSince
        ? baseCampaignsQuery.gte("created_at", createdSince)
        : baseCampaignsQuery;

      const campaignsRes = await campaignsQuery.order("created_at", { ascending: false }).limit(limit);
      const { data, error } = campaignsRes;

      if (error) throw error;
      const campaigns = (data ?? []) as Array<
        Database["public"]["Tables"]["campaigns"]["Row"] & { ab_test_id?: string | null; ab_variant?: string | null }
      >;

      const byCampaignStats = await fetchCampaignMetricsBundle(storeId, effectiveUserId, campaigns.map((c) => c.id));

      const abTestIds = campaigns.map((c) => c.ab_test_id).filter(Boolean);
      let winnersByTestId = new Map<string, string | null>();
      if (abTestIds.length > 0) {
        const { data: abTests } = await supabase
          .from("ab_tests")
          .select("id,winner_variant,status")
          .in("id", abTestIds);
        type AbTestRow = { id: string; winner_variant: string | null };
        winnersByTestId = new Map(
          ((abTests ?? []) as AbTestRow[]).map((t) => [t.id, t.winner_variant ?? null]),
        );
      }

      return campaigns.map((campaign): CampaignListItem => {
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
        const aggregatedSent = Math.max(Number(campaign.sent_count ?? 0), stats.sent);
        const sentBase = Math.max(1, aggregatedSent);
        const readRate = Number(campaign.read_count ?? 0) / sentBase;
        const clickRate = Number(campaign.click_count ?? 0) / sentBase;
        const suppressionBase = aggregatedSent + stats.suppressedCooldown + stats.suppressedOptOut;
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
          aggregated_sent_count: aggregatedSent,
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
  /** Modo `sample` (RFM): máximo de linhas (200–2000). Default 500. */
  sampleMaxRows?: number;
};

export function useContacts(options: UseContactsOptions = {}) {
  const variant = options.variant ?? "sample";
  const page = options.page ?? 1;
  const sampleMaxRows = Math.min(2000, Math.max(200, options.sampleMaxRows ?? 500));
  const pageSize = variant === "sample" ? sampleMaxRows : (options.pageSize ?? 50);
  const search =
    variant === "list"
      ? (options.search ?? "")
          .trim()
          .replace(/,/g, " ")
      : "";
  const rfmSegment = variant === "list" ? (options.rfmSegment ?? null) : null;

  const { user } = useAuth();
  return useQuery({
    queryKey: ["contacts", user?.id ?? null, variant, page, pageSize, search, rfmSegment, variant === "sample" ? sampleMaxRows : 0],
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
        dataQuery = dataQuery.order("created_at", { ascending: false }).limit(sampleMaxRows);
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
  opts?: {
    assigneeFilter?: InboxAssigneeFilter;
    mineAssigneeLabel?: string | null;
    /** Quando o Realtime falha, acelera o refetch automático. */
    realtimeDegraded?: boolean;
  },
) {
  const { user } = useAuth();
  const assigneeFilter = opts?.assigneeFilter ?? "all";
  const mineLabel = (opts?.mineAssigneeLabel ?? "").trim();

  return useInfiniteQuery({
    queryKey: [
      "conversations",
      user?.id ?? null,
      statusFilter,
      assigneeFilter,
      mineLabel,
      opts?.realtimeDegraded ? 1 : 0,
    ],
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
    refetchInterval: opts?.realtimeDegraded ? 12_000 : 45_000,
    enabled: !!user,
  });
}

const MESSAGE_LIST_COLUMNS = "id,conversation_id,content,created_at,direction,status,type,external_id,user_id";

/** Limite máximo de mensagens por conversa no Inbox (evita respostas gigantes no browser). */
export const INBOX_MESSAGES_MAX_LIMIT = 2000;
export const INBOX_MESSAGES_DEFAULT_LIMIT = 200;
export const INBOX_MESSAGES_LOAD_STEP = 100;

/**
 * Últimas `limit` mensagens da conversa (mais recentes), ordenadas cronologicamente para a UI.
 * Usa `ORDER BY created_at DESC` + `limit` e inverte no cliente — `ASC LIMIT` sozinho devolvia as mais antigas.
 */
export function useMessages(
  conversationId: string | null,
  limit = INBOX_MESSAGES_DEFAULT_LIMIT,
  opts?: { realtimeDegraded?: boolean },
) {
  const capped = Math.min(INBOX_MESSAGES_MAX_LIMIT, Math.max(20, limit));
  return useQuery({
    queryKey: ["messages", conversationId, capped, opts?.realtimeDegraded ? 1 : 0],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_LIST_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(capped);
      if (error) throw error;
      const rows = data ?? [];
      return [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    },
    enabled: !!conversationId,
    staleTime: 10_000,
    refetchInterval: opts?.realtimeDegraded ? 10_000 : false,
  });
}

/** Conversation ids whose message history contains the search text (min 2 chars). */
export function useConversationIdsByMessageSearch(search: string) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  const q = search.trim();
  return useQuery({
    queryKey: ["conversation-search-messages", user?.id ?? null, storeKey, q],
    queryFn: async () => {
      if (q.length < 2) return [] as string[];
      const { data, error } = await supabase.rpc("search_conversation_ids_by_message", { p_search: q });
      if (error) throw error;
      const rows = (data ?? []) as { conversation_id: string }[];
      return rows.map((r) => r.conversation_id);
    },
    enabled: !!user && q.length >= 2,
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
        ? supabase.from("analytics_daily").select(ANALYTICS_DAILY_LIST_COLUMNS).eq("store_id", storeId)
        : supabase.from("analytics_daily").select(ANALYTICS_DAILY_LIST_COLUMNS).eq("user_id", effectiveUserId);

      const { data, error } = await query.gte("date", since).order("date", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as AnalyticsDailyRow[];
      return aggregateAnalyticsDailyRows(rows);
    },
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
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
        .select("id,store_id,user_id,data_calculo,cenario_base,cenario_com_prescricoes,cenario_com_ux,confianca_ia,created_at")
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

      if (storeId) {
        try {
          const { data, error } = await supabase.rpc("get_conversion_baseline_summary", {
            p_store_id: storeId,
            p_period_days: days,
          });
          if (error) throw error;
          const row = (data ?? {}) as Record<string, unknown>;
          const sent = Number(row.sent ?? 0);
          const replied = Number(row.replied ?? 0);
          const delivered = Number(row.delivered ?? 0);
          const read = Number(row.read ?? 0);
          const conversions = Number(row.conversions ?? 0);
          const revenue = Number(row.revenue ?? 0);
          const prevSent = Number(row.prev_sent ?? 0);
          const prevReply = Number(row.prev_replied ?? 0);
          const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
          const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
          const readRate = sent > 0 ? (read / sent) * 100 : 0;
          const conversionRate = sent > 0 ? (conversions / sent) * 100 : 0;
          const revenuePerMessage = sent > 0 ? revenue / sent : 0;
          const prevReplyRate = prevSent > 0 ? (prevReply / prevSent) * 100 : 0;
          const replyRateDelta = prevReplyRate > 0 ? ((replyRate - prevReplyRate) / prevReplyRate) * 100 : 0;
          const tracked = Number(row.sla_tracked ?? 0);
          const breached = Number(row.sla_breached ?? 0);
          const slaCompliance = tracked > 0 ? ((tracked - breached) / tracked) * 100 : 100;
          const priorityMix = {
            urgent: Number(row.priority_urgent ?? 0),
            high: Number(row.priority_high ?? 0),
            normal: Number(row.priority_normal ?? 0),
            low: Number(row.priority_low ?? 0),
          };
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
              totalTracked: tracked,
              breached,
              compliance: slaCompliance,
            },
            priorityMix,
          };
        } catch (e) {
          console.warn("[useConversionBaseline] RPC falhou — fallback cliente", e);
        }
      }

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

      const CONVERSATIONS_BASELINE_CAP = 5000;
      const fetchConversationsBaseline = async () => {
        const full = storeId
          ? supabase
              .from("conversations")
              .select("id,sla_due_at,last_message_at,priority,status")
              .eq("store_id", storeId)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(CONVERSATIONS_BASELINE_CAP)
          : supabase
              .from("conversations")
              .select("id,sla_due_at,last_message_at,priority,status")
              .eq("user_id", effectiveUserId)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(CONVERSATIONS_BASELINE_CAP);
        const fullRes = await full;
        if (!fullRes.error) return fullRes;
        const minimal = storeId
          ? supabase
              .from("conversations")
              .select("id,last_message_at,status")
              .eq("store_id", storeId)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(CONVERSATIONS_BASELINE_CAP)
          : supabase
              .from("conversations")
              .select("id,last_message_at,status")
              .eq("user_id", effectiveUserId)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(CONVERSATIONS_BASELINE_CAP);
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
      type AttributionScopeRow = Pick<
        Database["public"]["Tables"]["attribution_events"]["Row"],
        "order_value" | "order_date" | "attributed_campaign_id"
      >;
      const storeCampaignIds = (campaignsScopeRes.data ?? []).map((r: { id: string }) => r.id);
      const attribution = scopeAttributionEventsForStore(
        (attributionRes.data ?? []) as AttributionScopeRow[],
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

      const revenue = attribution.reduce((sum, row) => sum + Number(row.order_value ?? 0), 0);
      const conversions = attribution.length;
      const conversionRate = sent > 0 ? (conversions / sent) * 100 : 0;
      const revenuePerMessage = sent > 0 ? revenue / sent : 0;

      const prevSent = sendsPrev.filter((s) => String(s.status ?? "").startsWith("sent")).length;
      const prevReply = sendsPrev.filter((s) => String(s.status ?? "") === "replied").length;
      const prevReplyRate = prevSent > 0 ? (prevReply / prevSent) * 100 : 0;
      const replyRateDelta = prevReplyRate > 0 ? ((replyRate - prevReplyRate) / prevReplyRate) * 100 : 0;

      const now = Date.now();
      const withSla = conversations.filter((c) => Boolean(c.sla_due_at));
      const breachedSla = withSla.filter((c) => {
        const t = new Date(c.sla_due_at ?? "").getTime();
        return Number.isFinite(t) && t < now;
      }).length;
      const slaCompliance = withSla.length > 0 ? ((withSla.length - breachedSla) / withSla.length) * 100 : 100;

      const priorityMix = conversations.reduce(
        (acc, c) => {
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
    refetchOnWindowFocus: false,
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
          ? supabase.from("analytics_daily").select(ANALYTICS_DAILY_LIST_COLUMNS).eq("store_id", storeId)
          : supabase.from("analytics_daily").select(ANALYTICS_DAILY_LIST_COLUMNS).eq("user_id", effectiveUserId);

      const MAX_SCOPE_CAMPAIGN_IDS = 20_000;
      const MAX_ATTRIBUTED_CAMPAIGN_DETAIL = 500;

      const [analyticsRes, analyticsPrevRes, cartsRes, attributionRes] = await Promise.all([
        buildAnalyticsROI().gte("date", since).order("date", { ascending: true }),
        buildAnalyticsROI().select("revenue_influenced").gte("date", prevSince).lt("date", since),

        (storeId
          ? supabase.from("abandoned_carts").select("status,cart_value,recovered_at,campaign_id,automation_id").eq("store_id", storeId)
          : supabase.from("abandoned_carts").select("status,cart_value,recovered_at,campaign_id,automation_id").eq("user_id", effectiveUserId)
        ).gte("created_at", sinceIso),

        supabase
          .from("attribution_events")
          .select("order_value,attributed_campaign_id,attributed_automation_id")
          .eq("user_id", effectiveUserId)
          .gte("order_date", sinceIso),
      ]);

      if (analyticsRes.error) throw new Error(analyticsRes.error.message);

      const analytics = analyticsRes.data ?? [];
      const carts = cartsRes.data ?? [];
      const attributionQueryError = attributionRes.error?.message ?? null;
      const attributionRowsRaw = attributionRes.error ? [] : (attributionRes.data ?? []);

      const idsMentionedInAttribution = Array.from(
        new Set(
          attributionRowsRaw
            .map((r: { attributed_campaign_id?: string | null }) => r.attributed_campaign_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const scopeIdsQuery = storeId
        ? supabase.from("campaigns").select("id").eq("store_id", storeId).limit(MAX_SCOPE_CAMPAIGN_IDS)
        : supabase.from("campaigns").select("id").eq("user_id", effectiveUserId).limit(MAX_SCOPE_CAMPAIGN_IDS);
      const { data: scopeIdRows, error: scopeIdsErr } = await scopeIdsQuery;
      if (scopeIdsErr) throw new Error(scopeIdsErr.message);
      const idsFromTable = (scopeIdRows ?? []).map((r: { id: string }) => r.id);
      const scopeUnion = Array.from(new Set([...idsFromTable, ...idsMentionedInAttribution]));
      const SCOPE_CAP = MAX_SCOPE_CAMPAIGN_IDS + 500;
      const storeCampaignIdsForScope = scopeUnion.slice(0, SCOPE_CAP);
      const scopeTruncated =
        idsFromTable.length >= MAX_SCOPE_CAMPAIGN_IDS || scopeUnion.length > storeCampaignIdsForScope.length;

      const attribution = scopeAttributionEventsForStore(
        attributionRowsRaw,
        storeId,
        storeCampaignIdsForScope,
      );

      const attributedCampaignIdsUniq = Array.from(
        new Set(
          attribution
            .map((e) => e.attributed_campaign_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const detailFetchTruncated = attributedCampaignIdsUniq.length > MAX_ATTRIBUTED_CAMPAIGN_DETAIL;
      const attributedCampaignIds = attributedCampaignIdsUniq.slice(0, MAX_ATTRIBUTED_CAMPAIGN_DETAIL);

      let campaigns = [] as Array<{
        id: string;
        name: string;
        channel: string;
        sent_count: number | null;
        custo_total_envio?: number | null;
      }>;
      if (attributedCampaignIds.length > 0) {
        const { data: campRows, error: campErr } = await supabase
          .from("campaigns")
          .select("id,name,channel,sent_count,custo_total_envio")
          .in("id", attributedCampaignIds);
        if (campErr) throw new Error(campErr.message);
        campaigns = (campRows ?? []) as typeof campaigns;
      }

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
      const roasSpendPartial = detailFetchTruncated || scopeTruncated;

      return {
        totalRevenue,
        revGrowth,
        roas,
        totalSpendBrl,
        roasDenominatorMissing,
        roasSpendPartial,
        scopeTruncated,
        detailFetchTruncated,
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
        chartData: downsampleDailySeriesBySum(
          analytics.map((d) => ({
            date: new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              timeZone: "America/Sao_Paulo",
            }),
            receita: Number(d.revenue_influenced),
          })),
          ["receita"],
          CHART_SERIES_MAX_POINTS,
        ),
      };
    },
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
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

const EMPTY_RFM_REPORT_COUNTS: RfmReportCounts = {
  champions: 0,
  loyal: 0,
  at_risk: 0,
  lost: 0,
  new: 0,
  other: 0,
  total: 0,
  avgChs: null,
};

/** Contagens RFM + CHS médio via RPC `get_rfm_report_counts` (sem full-scan no browser). */
export function useRfmReportCounts() {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  return useQuery({
    queryKey: ["rfm-report-counts", user?.id ?? null, storeKey],
    queryFn: async (): Promise<RfmReportCounts> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore(scope?.activeStoreId);
      if (!userId || !effectiveUserId) return { ...EMPTY_RFM_REPORT_COUNTS };

      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_rfm_report_counts", {
        p_store_id: storeId,
        p_owner_user_id: effectiveUserId,
      });

      if (!rpcErr && rpcData && typeof rpcData === "object") {
        const j = rpcData as Record<string, unknown>;
        return {
          champions: Number(j.champions ?? 0),
          loyal: Number(j.loyal ?? 0),
          at_risk: Number(j.at_risk ?? 0),
          lost: Number(j.lost ?? 0),
          new: Number(j.new ?? 0),
          other: Number(j.other ?? 0),
          total: Number(j.total ?? 0),
          avgChs: j.avg_chs == null ? null : Number(j.avg_chs),
        };
      }

      console.warn(
        "[useRfmReportCounts] RPC get_rfm_report_counts indisponível — contagens zeradas até aplicar a migração no Supabase.",
        rpcErr?.message ?? rpcErr,
      );
      return { ...EMPTY_RFM_REPORT_COUNTS };
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
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  return useQuery({
    queryKey: ["customer-cohorts", user?.id ?? null, storeKey],
    queryFn: async (): Promise<CustomerCohortRow[]> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore(scope?.activeStoreId);
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

/**
 * Agrega envios por dia da semana e faixa horária (últimos `days`) no browser.
 * Preferir `useDashboardSnapshot().heatmap` (RPC) em ecrãs que já chamam o snapshot — evita até 8000 linhas no cliente.
 */
export function useMessageSendHeatmap(days: number) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  return useQuery({
    queryKey: ["message-send-heatmap", user?.id ?? null, days, storeKey],
    queryFn: async (): Promise<MessageSendHeatmap> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore(scope?.activeStoreId);
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

export type ProblemsQueryResult = {
  /** Linhas para cartões / listas (ordenadas por `detected_at`). */
  items: OpportunityRow[];
  /** Total de oportunidades abertas (mesmos filtros), para contagens na UI. */
  totalCount: number;
  /** Soma de `estimated_impact` em todas as linhas abertas (agregado no servidor). */
  totalEstimatedImpact: number;
};

const DEFAULT_PROBLEMS_LIST_LIMIT = 50;
const MAX_PROBLEMS_LIST_LIMIT = 120;

/**
 * Oportunidades não resolvidas/ignoradas: lista limitada + totais (contagem e soma de impacto) sem trazer 500 linhas completas.
 */
export function useProblems(opts?: { listLimit?: number }) {
  const { user } = useAuth();
  const listLimit = Math.min(MAX_PROBLEMS_LIST_LIMIT, Math.max(15, opts?.listLimit ?? DEFAULT_PROBLEMS_LIST_LIMIT));
  return useQuery({
    queryKey: ["problems", user?.id ?? null, listLimit],
    queryFn: async (): Promise<ProblemsQueryResult> => {
      const { userId, storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!userId || !effectiveUserId) {
        return { items: [], totalCount: 0, totalEstimatedImpact: 0 };
      }

      const applyTenant = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
        storeId ? q.eq("store_id", storeId) : q.eq("user_id", effectiveUserId);

      const applyOpen = <T extends { neq: (c: string, v: string) => T }>(q: T) =>
        q.neq("status", "resolvido").neq("status", "ignorado");

      const listQuery = applyOpen(
        applyTenant(supabase.from("opportunities").select(OPPORTUNITIES_LIST_SELECT)),
      )
        .order("detected_at", { ascending: false })
        .range(0, listLimit - 1);

      const countQuery = applyOpen(
        applyTenant(supabase.from("opportunities").select("id", { count: "exact", head: true })),
      );

      const sumQuery = applyOpen(
        applyTenant(supabase.from("opportunities").select("estimated_impact.sum()")),
      ).maybeSingle();

      const [listRes, countRes, sumRes] = await Promise.all([listQuery, countQuery, sumQuery]);

      if (listRes.error) throw listRes.error;
      if (countRes.error) throw countRes.error;

      const items = (listRes.data ?? []) as OpportunityRow[];
      const totalCount = countRes.count ?? 0;

      let totalEstimatedImpact = 0;
      if (!sumRes.error && sumRes.data != null) {
        const row = sumRes.data as Record<string, unknown>;
        const raw = row.sum ?? row["estimated_impact.sum"];
        totalEstimatedImpact = Number(raw ?? 0);
        if (!Number.isFinite(totalEstimatedImpact)) totalEstimatedImpact = 0;
      } else {
        totalEstimatedImpact = items.reduce((acc, p) => acc + Number(p.estimated_impact ?? 0), 0);
      }

      return { items, totalCount, totalEstimatedImpact };
    },
    staleTime: 60_000,
    enabled: !!user,
  });
}

/**
 * Forecast Projection: Calls server-side statistical math for revenue projection.
 */
export function useForecastProjection(storeId: string | null, days = 30) {
  return useQuery({
    queryKey: ["forecast-projection", storeId, days],
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await supabase.rpc("calculate_forecast_projection", {
        p_store_id: storeId,
        p_period_days: days
      });
      if (error) throw error;
      return data as {
        projected_30: number;
        trend_pct: number;
        avg_daily: number;
        total_realized: number;
        days_count: number;
        calculated_at: string;
      };
    },
    enabled: !!storeId,
    staleTime: 300_000, // 5 minutes cache
  });
}

/** 
 * Dashboard BFF: Fetches a complete snapshot of the dashboard metrics in one call.
 * Consolidates analytics, RFM, prescriptions, opportunities and heatmap.
 */
export function useDashboardSnapshot(days = 30) {
  const { user, loading: authLoading } = useAuth();
  const scope = useStoreScopeOptional();
  const storeKey = scope?.activeStoreId ?? "";
  return useQuery({
    queryKey: ["dashboard-snapshot", user?.id ?? null, days, storeKey],
    queryFn: async () => {
      const { storeId } = await getCurrentUserAndStore(scope?.activeStoreId);
      if (!storeId) throw new Error("Loja não encontrada");

      const { data, error } = await supabase.rpc("get_dashboard_snapshot", {
        p_store_id: storeId,
        p_period_days: days
      });

      if (error) throw error;
      return data as {
        analytics: {
          total_revenue: number;
          total_sent: number;
          total_delivered: number;
          total_read: number;
          total_new_contacts: number;
        };
        prev_revenue: number;
        rfm: {
          champions: number;
          loyal: number;
          at_risk: number;
          lost: number;
          new: number;
          total_customers: number;
          avg_chs: number;
        };
        opportunities: number;
        unread: number;
        prescriptions: {
          active_count: number;
          pending_count: number;
        };
        heatmap: {
          cells: Record<string, number>;
          max_val: number;
        };
        open_conversations?: number;
        rev_growth_pct?: number;
        avg_read_rate_pct?: number;
        messaging_order_conversion_pct?: number;
        ideal_purchase_count?: number;
        estimated_opportunity_revenue?: number;
        chs_breakdown?: Record<string, number>;
        chart_series?: unknown[];
        attributed_order_count?: number;
        attributed_order_revenue?: number;
        timestamp: string;
      };
    },
    enabled: !authLoading && !!user,
    staleTime: 60_000,
  });
}
