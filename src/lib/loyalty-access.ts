/** Alinhado a Planos.tsx: Starter não inclui programa de fidelidade completo. */
export function hasFullLoyaltyPlan(plan: string | null | undefined): boolean {
  return plan === "growth" || plan === "scale" || plan === "enterprise";
}
