/**
 * Benchmarks de conversão por segmento — espelha a tabela `BENCHMARKS`
 * em `supabase/functions/gerar-diagnostico/index.ts`.
 *
 * Fontes: dados públicos ABComm / Nuvemshop / E-commerce Brasil 2024.
 * Usado na UI ConvertIQ para mostrar "sua loja vs. lojas similares".
 */

export const CONVERSION_BENCHMARKS_BY_SEGMENT: Record<string, number> = {
  "Moda": 2.8,
  "Beleza e Cosméticos": 3.1,
  "Suplementos": 3.4,
  "Eletrônicos": 1.9,
  "Pet": 2.6,
  "Casa e Decoração": 2.2,
  "Alimentos": 3.0,
  "Outro": 2.5,
};

export const CONVERSION_BENCHMARKS_SOURCE = "Dados setoriais públicos (ABComm / Nuvemshop, 2024)";

/**
 * Resolve um label de segmento "amigável" (qualquer caixa) para a chave canônica.
 * Tolera: lowercase, "moda", "beleza", "supplements", etc.
 */
export function normalizeSegmentLabel(raw: string | null | undefined): string {
  if (!raw) return "Outro";
  const s = String(raw).trim().toLowerCase();
  if (!s) return "Outro";
  if (s.includes("moda") || s === "fashion") return "Moda";
  if (s.includes("beleza") || s.includes("cosm") || s === "beauty") return "Beleza e Cosméticos";
  if (s.includes("suplemento") || s.includes("supplement")) return "Suplementos";
  if (s.includes("eletr") || s.includes("electron")) return "Eletrônicos";
  if (s.includes("pet")) return "Pet";
  if (s.includes("casa") || s.includes("dec") || s.includes("home")) return "Casa e Decoração";
  if (s.includes("aliment") || s.includes("food")) return "Alimentos";
  return "Outro";
}

export function benchmarkForSegment(segment: string | null | undefined): { value: number; label: string } {
  const key = normalizeSegmentLabel(segment);
  return {
    value: CONVERSION_BENCHMARKS_BY_SEGMENT[key] ?? CONVERSION_BENCHMARKS_BY_SEGMENT["Outro"],
    label: key,
  };
}
