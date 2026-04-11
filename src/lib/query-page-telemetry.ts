/**
 * Telemetria opcional de duração de queries por página (desenvolvimento / diagnóstico).
 * Ative com `VITE_ENABLE_QUERY_TIMING=true`.
 */
const enabled =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_ENABLE_QUERY_TIMING === "true";

export function logQueryTiming(label: string, startedAtMs: number): void {
  if (!enabled) return;
  const ms = Math.round(performance.now() - startedAtMs);
  console.debug(`[query-timing] ${label}: ${ms}ms`);
}
