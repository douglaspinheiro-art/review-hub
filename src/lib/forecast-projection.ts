import type { AnalyticsDailyRow } from "@/lib/analytics-aggregate";

/** Mínimo de dias com dados para exibir gráfico e projeção (evita ruído com 1–2 pontos). */
export const FORECAST_MIN_DAYS = 7;

/** Janela máxima de dias usada na página Forecast. */
export const FORECAST_ANALYTICS_DAYS = 120;

export type ForecastBucketPoint = {
  name: string;
  realizado: number;
};

export type ForecastProjectionResult = {
  chartBuckets: ForecastBucketPoint[];
  projected30: number;
  trendPct: number;
  avgDaily: number;
  realizedWindowTotal: number;
};

export function bucketRevenueRows(
  rows: { date: string; revenue_influenced: unknown }[],
  numBuckets: number,
): ForecastBucketPoint[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const size = Math.max(1, Math.ceil(sorted.length / numBuckets));
  const out: ForecastBucketPoint[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const slice = sorted.slice(i * size, (i + 1) * size);
    if (slice.length === 0) break;
    const sum = slice.reduce((s, r) => s + Number(r.revenue_influenced ?? 0), 0);
    const d0 = slice[0].date;
    const name = new Date(d0).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    out.push({ name, realizado: sum });
  }
  return out;
}

/**
 * Projeção de receita influenciada para ~30 dias: média diária da janela com ajuste amortecido
 * pela tendência entre a primeira e a segunda metade do período (limitado a ±25%).
 */
export function buildForecastProjection(rows: AnalyticsDailyRow[]): ForecastProjectionResult {
  if (rows.length === 0) {
    return {
      chartBuckets: [],
      projected30: 0,
      trendPct: 0,
      avgDaily: 0,
      realizedWindowTotal: 0,
    };
  }
  const total = rows.reduce((s, x) => s + Number(x.revenue_influenced), 0);
  const days = rows.length;
  const avgDailyVal = total / days;
  const mid = Math.floor(rows.length / 2);
  const prevHalf = rows.slice(0, mid).reduce((s, x) => s + Number(x.revenue_influenced), 0);
  const recentHalf = rows.slice(mid).reduce((s, x) => s + Number(x.revenue_influenced), 0);
  const growth = prevHalf > 0 ? ((recentHalf - prevHalf) / prevHalf) * 100 : 0;
  const damped = Math.min(25, Math.max(-25, growth * 0.35));
  const projected = avgDailyVal * 30 * (1 + damped / 100);
  const nBuckets = Math.min(8, Math.max(4, Math.ceil(days / 14)));
  const chartBuckets = bucketRevenueRows(rows, nBuckets);
  return {
    chartBuckets,
    projected30: Math.max(0, projected),
    trendPct: growth,
    avgDaily: avgDailyVal,
    realizedWindowTotal: total,
  };
}

/** Formata eixo Y: valores baixos em R$ inteiros; acima de 999 em k. */
export function formatForecastYAxisBrl(value: number): string {
  const v = Math.abs(value);
  if (!Number.isFinite(v)) return "—";
  if (v < 1000) {
    return Math.round(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  }
  const k = value / 1000;
  const rounded = Math.abs(k) >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
  return `R$ ${rounded}k`;
}
