import type { EcommerceVertical } from "@/lib/strategy-profile";

/**
 * Benchmark de conversão por vertical — espelha `BENCHMARKS` em `gerar-diagnostico`.
 * Chaves de segmento na edge usam estes labels em português.
 */
export const BENCHMARK_CVR_BY_VERTICAL: Record<EcommerceVertical, number> = {
  fashion: 2.8,
  beauty: 3.1,
  supplements: 3.4,
  pets: 2.6,
  generic: 2.5,
};

/**
 * Ticket médio típico por vertical no e-commerce BR (R$).
 * Smart-default usado no /onboarding quando o lojista ainda não importou dados da loja.
 */
export const BENCHMARK_TICKET_MEDIO_BY_VERTICAL: Record<EcommerceVertical, number> = {
  fashion: 180,
  beauty: 140,
  supplements: 220,
  pets: 160,
  generic: 250,
};

export function ticketMedioForVertical(v: EcommerceVertical | null | undefined): number {
  if (!v || !(v in BENCHMARK_TICKET_MEDIO_BY_VERTICAL)) return BENCHMARK_TICKET_MEDIO_BY_VERTICAL.generic;
  return BENCHMARK_TICKET_MEDIO_BY_VERTICAL[v];
}

/** Label de segmento enviado à edge `gerar-diagnostico` (compatível com BENCHMARKS no Deno). */
export const VERTICAL_TO_SEGMENT_LABEL: Record<EcommerceVertical, string> = {
  fashion: "Moda",
  beauty: "Beleza e Cosméticos",
  supplements: "Suplementos",
  pets: "Pet",
  generic: "Outro",
};

export function benchmarkCvrForVertical(v: EcommerceVertical | null | undefined): number {
  if (!v || !(v in BENCHMARK_CVR_BY_VERTICAL)) return BENCHMARK_CVR_BY_VERTICAL.generic;
  return BENCHMARK_CVR_BY_VERTICAL[v];
}

export function segmentLabelForVertical(v: EcommerceVertical | null | undefined): string {
  if (!v || !(v in VERTICAL_TO_SEGMENT_LABEL)) return VERTICAL_TO_SEGMENT_LABEL.generic;
  return VERTICAL_TO_SEGMENT_LABEL[v];
}
