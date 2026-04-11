/**
 * Critérios únicos para frescura do snapshot GA4 (funil_diario).
 * Usar em Funil, Benchmark e qualquer alerta de dados desatualizados.
 */
export const GA4_SNAPSHOT_MAX_AGE_MS = 3 * 86400_000;

/** True quando existe ingestão GA4 dentro da janela de frescura (3 dias por defeito). */
export function isFunilGa4SnapshotRecent(lastIngestedAt: string | null): boolean {
  if (!lastIngestedAt) return false;
  const t = Date.parse(lastIngestedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= GA4_SNAPSHOT_MAX_AGE_MS;
}

/** Mensagem alinhada para UI quando o snapshot GA4 está velho ou ausente. */
export function funilGa4StaleHint(): string {
  const days = Math.round(GA4_SNAPSHOT_MAX_AGE_MS / 86400_000);
  return `Dados GA4 com mais de ${days} dias ou sem ingestão recente — confirme o job sync-funil-ga4 e as credenciais da loja.`;
}

/** Texto curto para badge (Benchmark, alertas compactos). */
export function funilGa4StaleSnapshotBadgeLabel(): string {
  const days = Math.round(GA4_SNAPSHOT_MAX_AGE_MS / 86400_000);
  return `Snapshot GA4 com mais de ${days} dias`;
}
