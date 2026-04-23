/**
 * Telemetria do funil pós-diagnóstico → checkout.
 * Eventos: diagnostic_viewed, plan_recommended, checkout_started,
 *          checkout_completed, paywall_blocked.
 *
 * Insere na tabela `funnel_telemetry_events` (RLS por user_id).
 * Fail-safe: nunca lança; nunca bloqueia o caller.
 */
import { supabase } from "@/lib/supabase";

export type FunnelEventName =
  | "diagnostic_viewed"
  | "plan_recommended"
  | "checkout_started"
  | "checkout_completed"
  | "paywall_blocked"
  // Fase 0 — baseline para medir loop ConvertIQ → Campanha → Receita
  | "prescription_converted_to_campaign"
  | "campaign_attributed_revenue_snapshot"
  // Funil de ativação ponta a ponta (admin telemetry 4.1)
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_abandoned"
  | "analisando_entered"
  | "analisando_completed"
  | "resultado_viewed"
  | "resultado_cta_clicked"
  | "resultado_checkout_started"
  // Onda 1.4 / 3.4 / 3.5 — gates e captura/compartilhamento
  | "ga4_platform_divergence_blocked"
  | "ga4_platform_divergence_ignored"
  | "lead_captured_pre_paywall"
  | "diagnostic_share_link_created"
  | "diagnostic_share_link_viewed";

export interface FunnelEventInput {
  event: FunnelEventName;
  recommendedPlan?: string | null;
  selectedPlan?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown>;
}

export async function trackFunnelEvent(input: FunnelEventInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return; // RLS exige user_id = auth.uid()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("funnel_telemetry_events").insert({
      user_id: userId,
      event_name: input.event,
      recommended_plan: input.recommendedPlan ?? null,
      selected_plan: input.selectedPlan ?? null,
      route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
      metadata: input.metadata ?? {},
    });
  } catch {
    // intencional: telemetria nunca derruba o fluxo
  }
}
