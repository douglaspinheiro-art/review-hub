import type { Database } from "@/lib/database.types";

export const BENCHMARK_NICHE_KEYS = [
  "Moda",
  "Beleza",
  "Suplementos",
  "Eletrônicos",
  "Casa",
  "Pet",
  "Outros",
] as const;

export type BenchmarkNicheKey = (typeof BENCHMARK_NICHE_KEYS)[number];

/** Referências de mercado orientativas (fallback quando `sector_benchmarks` não tem linha). */
export const STATIC_BENCHMARK_BY_NICHE: Record<
  BenchmarkNicheKey,
  { cvr_medio: number; ticket_medio: number }
> = {
  Moda: { cvr_medio: 2.8, ticket_medio: 185 },
  Beleza: { cvr_medio: 3.1, ticket_medio: 145 },
  Suplementos: { cvr_medio: 3.4, ticket_medio: 220 },
  Eletrônicos: { cvr_medio: 1.9, ticket_medio: 640 },
  Casa: { cvr_medio: 2.2, ticket_medio: 270 },
  Pet: { cvr_medio: 2.6, ticket_medio: 200 },
  Outros: { cvr_medio: 2.5, ticket_medio: 220 },
};

/** Chave da linha em `sector_benchmarks.segmento` (SQL seed / operacional). */
export const UI_NICHE_TO_SECTOR_DB: Record<BenchmarkNicheKey, string> = {
  Moda: "Moda",
  Beleza: "Beleza e Cosméticos",
  Suplementos: "Suplementos",
  Eletrônicos: "Eletrônicos",
  Casa: "Casa e Decoração",
  Pet: "Pet",
  Outros: "Outro",
};

export type SectorBenchmarkRow = Database["public"]["Tables"]["sector_benchmarks"]["Row"];

export type ResolvedBenchmark = {
  cvr_medio: number;
  ticket_medio: number;
  /** Valores agregados na base (quando existem colunas preenchidas). */
  source: "database" | "static";
  updated_at: string | null;
  sectorSegmentLabel: string;
};

export function mergeSectorIntoStatic(
  niche: BenchmarkNicheKey,
  sectorRow: SectorBenchmarkRow | null | undefined,
): ResolvedBenchmark {
  const staticRow = STATIC_BENCHMARK_BY_NICHE[niche];
  const sectorLabel = UI_NICHE_TO_SECTOR_DB[niche];
  const hasDbCvr = sectorRow?.cvr_media != null && Number.isFinite(Number(sectorRow.cvr_media));
  const hasDbTicket =
    sectorRow?.ticket_medio_referencia != null &&
    Number.isFinite(Number(sectorRow.ticket_medio_referencia));
  const fromDb = !!(sectorRow && (hasDbCvr || hasDbTicket));
  return {
    cvr_medio: hasDbCvr ? Number(sectorRow!.cvr_media) : staticRow.cvr_medio,
    ticket_medio: hasDbTicket
      ? Number(sectorRow!.ticket_medio_referencia)
      : staticRow.ticket_medio,
    source: fromDb ? "database" : "static",
    updated_at: sectorRow?.updated_at ?? null,
    sectorSegmentLabel: sectorLabel,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Mapeia `stores.segment` (onboarding, edge antiga, label PT) para chave de UI. */
export function mapStoreSegmentToUiNiche(segment: string | null | undefined): BenchmarkNicheKey {
  if (segment == null || segment === "") return "Moda";
  const s = norm(segment);

  if (s === "fashion" || s === "moda") return "Moda";
  if (s === "beauty" || s === "beleza" || (s.includes("beleza") && s.includes("cosm"))) return "Beleza";
  if (s === "supplements" || s === "suplementos") return "Suplementos";
  if (s === "electronics" || s === "eletrônicos" || s === "eletronicos") return "Eletrônicos";
  if (s === "casa" || s.includes("decora")) return "Casa";
  if (s === "pets" || s === "pet") return "Pet";
  if (s === "generic" || s === "outros" || s === "outro" || s === "other") return "Outros";

  if (segment === "Beleza & Cosméticos" || segment === "Beleza e Cosméticos") return "Beleza";
  if (segment === "Pets" || segment === "Pet") return "Pet";
  if (segment === "Casa e Decoração") return "Casa";
  if (segment === "Eletrônicos" || segment === "Eletronicos") return "Eletrônicos";
  if (segment === "Suplementos") return "Suplementos";
  if (segment === "Moda") return "Moda";
  if (segment === "Outros" || segment === "Outro") return "Outros";

  for (const key of BENCHMARK_NICHE_KEYS) {
    if (norm(key) === s) return key;
  }

  return "Moda";
}

export function safePctDiff(sua: number, media: number): number | null {
  if (!Number.isFinite(sua) || !Number.isFinite(media) || media === 0) return null;
  return Math.round(((sua - media) / media) * 100);
}
