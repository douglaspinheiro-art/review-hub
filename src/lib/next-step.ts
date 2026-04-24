import type { Profile } from "@/contexts/AuthContext";

export type NextStepRoute =
  | "/onboarding"
  | "/analisando"
  | "/resultado"
  | "/dashboard";

export interface NextStepInput {
  profile: Pick<Profile, "onboarding_completed" | "subscription_status"> | null;
  hasDiagnostic: boolean;
}

/**
 * Centraliza a regra "próximo passo" do funil signup → dashboard.
 *
 * - sem onboarding_completed                              → /onboarding
 * - onboarding_completed && sem diagnóstico               → /analisando
 * - com diagnóstico && subscription_status !== "active"   → /resultado (paywall)
 * - active                                                → /dashboard
 */
export function getNextStep({ profile, hasDiagnostic }: NextStepInput): NextStepRoute {
  if (!profile) return "/onboarding";
  // Paid users (active OR pending_activation) skip the funnel — vão para
  // /dashboard, e o DashboardLayout decide se mostra a tela de bloqueio
  // PendingActivationScreen ou o produto.
  if (
    profile.subscription_status === "active" ||
    profile.subscription_status === "pending_activation"
  ) {
    return "/dashboard";
  }
  if (!profile.onboarding_completed) return "/onboarding";
  if (!hasDiagnostic) return "/analisando";
  return "/resultado";
}
