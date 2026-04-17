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
  | "paywall_blocked";

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
