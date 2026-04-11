/**
 * Tipos e mapeamento do RPC `get_dashboard_snapshot` para a home do dashboard.
 * Centraliza KPIs para evitar casts `(statsData as any)` na UI.
 */

export type DashboardHomeChartPoint = {
  date: string;
  enviadas: number;
  entregues: number;
  lidas: number;
  receita: number;
};

export type DashboardHomeStats = {
  revenueLast30: number;
  revGrowth: number;
  newContactsLast30: number;
  /** Taxa de conversão por pedidos atribuídos / envios (mensageria), 0–100. */
  conversionRate: number;
  openConversations: number;
  totalUnread: number;
  activeOpportunities: number;
  avgReadRate: number;
  totalContacts: number;
  deliveryRate: number;
  activeContacts: number;
  chartData: DashboardHomeChartPoint[];
  chs: number;
  chsLabel: string;
  chsBreakdown?: {
    conversao: number;
    funil: number;
    produtos: number;
    mobile: number;
  };
  chsHistory?: { data: string; score: number; label?: string }[];
  atRiskCount: number;
  idealPurchaseCount: number;
  estimatedRevenue: number;
};

export function chsLabelFromScore(score: number): string {
  if (!Number.isFinite(score) || score <= 0) return "Sem dados";
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Boa saúde";
  if (score >= 50) return "Atenção moderada";
  if (score >= 30) return "Precisa de cuidado";
  return "Crítico";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Converte resposta JSON do RPC em estrutura tipada para a UI. */
export function mapDashboardSnapshotRpcToHomeStats(raw: unknown): DashboardHomeStats {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const analytics = (o.analytics && typeof o.analytics === "object" ? o.analytics : {}) as Record<string, unknown>;
  const rfm = (o.rfm && typeof o.rfm === "object" ? o.rfm : {}) as Record<string, unknown>;
  const chsBreakdown =
    o.chs_breakdown && typeof o.chs_breakdown === "object"
      ? (o.chs_breakdown as DashboardHomeStats["chsBreakdown"])
      : undefined;

  const totalSent = num(analytics.total_sent);
  const totalRead = num(analytics.total_read);
  const totalDel = num(analytics.total_delivered);
  const avgReadRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : num(o.avg_read_rate_pct);
  const deliveryRate = totalSent > 0 ? Math.round((totalDel / totalSent) * 100) : 0;

  const chs = Math.round(num(rfm.avg_chs));
  const chartSeries = Array.isArray(o.chart_series) ? o.chart_series : [];

  const chartData: DashboardHomeChartPoint[] = chartSeries.map((row) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const d = r.date;
    const dateStr =
      typeof d === "string"
        ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : "";
    return {
      date: dateStr,
      enviadas: num(r.messages_sent),
      entregues: num(r.messages_delivered),
      lidas: num(r.messages_read),
      receita: num(r.revenue_influenced),
    };
  });

  const now = new Date();
  const chsHistory: DashboardHomeStats["chsHistory"] =
    chs > 0
      ? [
          { data: new Date(now.getTime() - 86400000 * 30).toISOString().slice(0, 10), score: Math.max(0, chs - 3) },
          { data: now.toISOString().slice(0, 10), score: chs },
        ]
      : undefined;

  return {
    revenueLast30: num(analytics.total_revenue),
    revGrowth: num(o.rev_growth_pct),
    newContactsLast30: num(analytics.total_new_contacts),
    conversionRate: num(o.messaging_order_conversion_pct),
    openConversations: num(o.open_conversations),
    totalUnread: num(o.unread),
    activeOpportunities: num(o.opportunities),
    avgReadRate,
    totalContacts: num(rfm.total_customers),
    deliveryRate,
    activeContacts: num(rfm.total_customers),
    chartData,
    chs,
    chsLabel: chsLabelFromScore(chs),
    chsBreakdown,
    chsHistory,
    atRiskCount: num(rfm.at_risk),
    idealPurchaseCount: num(o.ideal_purchase_count),
    estimatedRevenue: num(o.estimated_opportunity_revenue),
  };
}

/** Mescla stats legadas (sem loja ou fallback) com campos extras esperados pela home. */
export function extendLegacyDashboardStats(legacy: {
  totalContacts: number;
  activeContacts: number;
  openConversations: number;
  totalUnread: number;
  avgReadRate: number;
  revenueLast30: number;
  newContactsLast30: number;
  revGrowth: number;
  deliveryRate: number;
  activeOpportunities: number;
  chartData: DashboardHomeChartPoint[];
}): DashboardHomeStats {
  return {
    ...legacy,
    conversionRate: 0,
    chs: 0,
    chsLabel: "Sem dados",
    atRiskCount: 0,
    idealPurchaseCount: 0,
    estimatedRevenue: 0,
  };
}
