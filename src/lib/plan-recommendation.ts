import type { PlanTier } from "@/lib/pricing-constants";

export type DiagnosticSeverity = "critico" | "alto" | "medio" | string;

export type DiagnosticProblemLite = {
  severidade?: DiagnosticSeverity;
};

export interface PlanRecommendationInput {
  /** Conversion Health Score (0-100). */
  chs?: number | null;
  /** Estimated monthly loss in BRL. */
  perdaMensal?: number | null;
  /** AI-detected problems (used to count critical ones). */
  problemas?: DiagnosticProblemLite[] | null;
}

export interface PlanRecommendation {
  tier: PlanTier;
  reason: string;
}

/**
 * Recomenda um plano pago a partir do diagnóstico.
 * Regras v1 (frontend, determinísticas):
 *   - chs < 25 OR perda > 200k         → scale
 *   - chs < 40 OR perda > 50k OR ≥2 críticos → growth
 *   - default                          → growth (entrada pós-diagnóstico)
 */
export function recommendPlan(input: PlanRecommendationInput): PlanRecommendation {
  const chs = typeof input.chs === "number" ? input.chs : null;
  const perda = typeof input.perdaMensal === "number" ? input.perdaMensal : 0;
  const problemasCriticos = (input.problemas ?? []).filter(
    (p) => String(p?.severidade ?? "").toLowerCase() === "critico",
  ).length;

  if ((chs !== null && chs < 25) || perda > 200_000) {
    return {
      tier: "scale",
      reason:
        "Operação grande com gargalo severo — Scale entrega multi-loja, IA Fair Use e CSM dedicado.",
    };
  }

  if (
    (chs !== null && chs < 40) ||
    perda > 50_000 ||
    problemasCriticos >= 2
  ) {
    return {
      tier: "growth",
      reason:
        "Diagnóstico mostra perda relevante — Growth cobre automações ilimitadas, previsão e A/B.",
    };
  }

  return {
    tier: "growth",
    reason:
      "Para começar a recuperar receita imediatamente, Growth é o plano de entrada recomendado.",
  };
}
