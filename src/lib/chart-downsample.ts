/** Máximo de pontos enviados aos gráficos (Recharts) para aliviar layout/DOM em séries longas. */
export const CHART_SERIES_MAX_POINTS = 72;

/**
 * Agrega séries diárias em menos pontos somando métricas numéricas por bucket,
 * preservando melhor a massa dos dados do que amostrar um dia em N.
 */
export function downsampleDailySeriesBySum<T extends Record<string, unknown>>(
  rows: readonly T[],
  sumKeys: readonly (keyof T)[],
  maxPoints: number,
): T[] {
  if (rows.length <= maxPoints) return [...rows];
  const bucketSize = Math.ceil(rows.length / maxPoints);
  const out: T[] = [];
  for (let start = 0; start < rows.length; start += bucketSize) {
    const slice = rows.slice(start, start + bucketSize);
    const base = { ...slice[0] } as T;
    for (const key of sumKeys) {
      let acc = 0;
      for (const r of slice) acc += Number(r[key] ?? 0);
      (base as Record<string, unknown>)[key as string] = acc;
    }
    out.push(base);
  }
  return out;
}
