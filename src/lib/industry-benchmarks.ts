/**
 * Referências agregadas para comparação na UI (alinhado a `weekly-benchmark` edge).
 * Valores são orientativos; revisar periodicamente com dados reais do produto.
 */
export const WHATSAPP_CAMPAIGN_BENCHMARKS_BR = {
  /** Leituras sobre mensagens enviadas (%) */
  readOnSentPct: 62,
  /** Respostas sobre enviadas (%) */
  replyOnSentPct: 8,
  /** Pedidos atribuídos sobre enviadas — referência setorial agregada moda BR (%) */
  attributedOrderOnSentPct: 6,
} as const;

/**
 * Distribuição de CVR (conversão geral pedidos/visitantes) por vertical no Brasil.
 * Valores agregados (percentil 25, mediana e percentil 75 + top 10%).
 * Use para posicionar a loja contra peers no diagnóstico — não é benchmark de meta.
 */
export type EcommerceVerticalKey =
  | "fashion"
  | "beauty"
  | "supplements"
  | "pets"
  | "generic";

export interface CvrPeerDistribution {
  p25: number;
  median: number;
  p75: number;
  top10: number;
  label: string;
}

export const CVR_PEER_DISTRIBUTION_BR: Record<EcommerceVerticalKey, CvrPeerDistribution> = {
  fashion:     { p25: 1.1, median: 1.8, p75: 2.8, top10: 3.6, label: "Moda" },
  beauty:      { p25: 1.4, median: 2.4, p75: 3.2, top10: 4.1, label: "Beleza" },
  supplements: { p25: 1.6, median: 2.7, p75: 3.6, top10: 4.5, label: "Suplementos" },
  pets:        { p25: 1.2, median: 2.1, p75: 2.9, top10: 3.8, label: "Pet" },
  generic:     { p25: 1.2, median: 1.9, p75: 2.6, top10: 3.4, label: "E-commerce" },
};

/** Estima o percentil aproximado da loja contra peers do segmento (0-100). */
export function estimatePeerPercentile(
  cvrPct: number,
  vertical: EcommerceVerticalKey | string | null | undefined,
): { percentile: number; distribution: CvrPeerDistribution } {
  const key = (vertical && (vertical in CVR_PEER_DISTRIBUTION_BR)
    ? vertical
    : "generic") as EcommerceVerticalKey;
  const d = CVR_PEER_DISTRIBUTION_BR[key];
  const cvr = Number.isFinite(cvrPct) && cvrPct > 0 ? cvrPct : 0;

  // Interpolação linear simples entre âncoras (0 → p25 → mediana → p75 → top10 → 100)
  let p: number;
  if (cvr <= 0) p = 1;
  else if (cvr <= d.p25) p = (cvr / d.p25) * 25;
  else if (cvr <= d.median) p = 25 + ((cvr - d.p25) / (d.median - d.p25)) * 25;
  else if (cvr <= d.p75) p = 50 + ((cvr - d.median) / (d.p75 - d.median)) * 25;
  else if (cvr <= d.top10) p = 75 + ((cvr - d.p75) / (d.top10 - d.p75)) * 15;
  else p = Math.min(99, 90 + ((cvr - d.top10) / d.top10) * 9);

  return { percentile: Math.max(1, Math.min(99, Math.round(p))), distribution: d };
}
