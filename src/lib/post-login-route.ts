import { supabase } from "@/lib/supabase";
import type { Profile } from "@/contexts/AuthContext";
import { getNextStep, type NextStepRoute } from "@/lib/next-step";

/**
 * Decide a rota pós-login (ou pós-mount em telas como `/`, `/onboarding`)
 * com base no profile + existência de diagnóstico.
 *
 * Centraliza a regra: usuário com diagnóstico mas sem assinatura ativa
 * SEMPRE volta para `/resultado` (página de conversão), em vez de /dashboard
 * ou /onboarding.
 */
export async function getPostLoginRoute(
  userId: string,
  profile: Profile | null,
): Promise<NextStepRoute> {
  let hasDiagnostic = false;
  try {
    const { data } = await supabase
      .from("diagnostics_v3")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    hasDiagnostic = !!data;
  } catch {
    // fail-safe: trata como sem diagnóstico
  }
  return getNextStep({ profile, hasDiagnostic });
}
