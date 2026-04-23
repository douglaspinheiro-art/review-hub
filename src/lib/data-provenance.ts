/**
 * Tipos e helpers para indicar a proveniência de uma métrica exibida no dashboard.
 *
 * - `real`      → dado vem direto de uma fonte autoritativa (RPC, webhook, GA4 sincronizado)
 * - `derived`   → dado calculado/agregado a partir de fontes reais (sem fallback estatístico)
 * - `estimated` → dado contém estimativa, fallback heurístico ou amostra
 */
export type DataSource = "real" | "derived" | "estimated";

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  real: "Real",
  derived: "Derivado",
  estimated: "Estimado",
};

export const DATA_SOURCE_DESCRIPTION: Record<DataSource, string> = {
  real: "Valor lido diretamente da fonte autoritativa (RPC, webhook ou integração).",
  derived: "Valor calculado a partir de dados reais, sem estimativa estatística.",
  estimated: "Inclui estimativa, fallback heurístico ou amostra do universo total.",
};

export function formatRelativeTime(input: string | number | Date | null | undefined): string {
  if (!input) return "—";
  const ts = typeof input === "string" || typeof input === "number" ? new Date(input).getTime() : input.getTime();
  if (!Number.isFinite(ts)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "agora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `há ${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `há ${diffDay}d`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

/** Retorna true quando o timestamp está acima do SLA (em minutos). */
export function isStale(input: string | number | Date | null | undefined, slaMinutes: number): boolean {
  if (!input) return true;
  const ts = typeof input === "string" || typeof input === "number" ? new Date(input).getTime() : input.getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > slaMinutes * 60 * 1000;
}