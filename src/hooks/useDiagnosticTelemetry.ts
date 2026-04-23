import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type DiagnosticTelemetryRow = {
  id: string;
  user_id: string | null;
  created_at: string;
  route: string | null;
  metadata: Record<string, unknown> | null;
};

export type DiagnosticTelemetrySummary = {
  rows: DiagnosticTelemetryRow[];
  total: number;
  fallbackCount: number;
  parseRetryCount: number;
  fallbackPct: number;
  parseRetryPct: number;
  avgMs: number;
  p95Ms: number;
  dailyVolume: { date: string; count: number }[];
  completenessBuckets: { bucket: string; count: number }[];
  topEnrichedFields: { field: string; count: number }[];
};

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function summarize(rows: DiagnosticTelemetryRow[]): DiagnosticTelemetrySummary {
  const total = rows.length;
  let fallbackCount = 0;
  let parseRetryCount = 0;
  const durations: number[] = [];
  const daily = new Map<string, number>();
  const buckets = { "0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0 };
  const enrichedTally = new Map<string, number>();

  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    if (m.fallback_mode === true) fallbackCount += 1;
    if (m.parse_retry === true) parseRetryCount += 1;

    const ms = num(m.total_ms);
    if (ms !== null && ms >= 0 && ms < 600_000) durations.push(ms);

    const day = r.created_at.slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + 1);

    const completeness = num(m.payload_completeness_pct);
    if (completeness !== null) {
      const c = Math.max(0, Math.min(100, completeness));
      if (c <= 25) buckets["0-25"] += 1;
      else if (c <= 50) buckets["26-50"] += 1;
      else if (c <= 75) buckets["51-75"] += 1;
      else buckets["76-100"] += 1;
    }

    const enriched = m.enriched_fields;
    if (Array.isArray(enriched)) {
      for (const f of enriched) {
        if (typeof f === "string" && f.length > 0) {
          enrichedTally.set(f, (enrichedTally.get(f) ?? 0) + 1);
        }
      }
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const avgMs = sorted.length ? Math.round(sorted.reduce((s, n) => s + n, 0) / sorted.length) : 0;
  const p95Ms = sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]) : 0;

  const dailyVolume = Array.from(daily.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const completenessBuckets = (["0-25", "26-50", "51-75", "76-100"] as const).map((bucket) => ({
    bucket,
    count: buckets[bucket],
  }));

  const topEnrichedFields = Array.from(enrichedTally.entries())
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    rows,
    total,
    fallbackCount,
    parseRetryCount,
    fallbackPct: total ? (fallbackCount / total) * 100 : 0,
    parseRetryPct: total ? (parseRetryCount / total) * 100 : 0,
    avgMs,
    p95Ms,
    dailyVolume,
    completenessBuckets,
    topEnrichedFields,
  };
}

/**
 * Lê eventos `diagnostic_generated` de `funnel_telemetry_events`.
 * Acesso de leitura para admin garantido por `funnel_telemetry_select_own_or_admin`.
 */
export function useDiagnosticTelemetry(rangeDays: 7 | 30) {
  return useQuery({
    queryKey: ["diagnostic-telemetry", rangeDays],
    queryFn: async (): Promise<DiagnosticTelemetrySummary> => {
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("funnel_telemetry_events")
        .select("id,user_id,created_at,route,metadata")
        .eq("event_name", "diagnostic_generated")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return summarize((data ?? []) as DiagnosticTelemetryRow[]);
    },
    staleTime: 60_000,
  });
}