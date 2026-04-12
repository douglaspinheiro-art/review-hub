import type { PlanTier } from "@/lib/pricing-constants";

const VALID: PlanTier[] = ["starter", "growth", "scale", "enterprise"];

/**
 * Mapeia o price.id do Stripe para `profiles.plan`.
 * Configure o secret `STRIPE_PRICE_TO_PLAN` na Edge como JSON, ex.:
 * `{"price_abc123":"growth","price_def456":"scale"}`
 */
export function parseStripePriceToPlanMap(raw: string | undefined | null): Record<string, PlanTier> {
  if (!raw?.trim()) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, PlanTier> = {};
    for (const [k, v] of Object.entries(obj)) {
      const p = String(v ?? "").toLowerCase();
      if (VALID.includes(p as PlanTier)) out[k] = p as PlanTier;
    }
    return out;
  } catch {
    return {};
  }
}

export function mapStripePriceIdToPlan(
  priceId: string | undefined | null,
  envJson: string | undefined | null,
): PlanTier | null {
  if (!priceId) return null;
  const map = parseStripePriceToPlanMap(envJson);
  return map[priceId] ?? null;
}

/** Deriva plano a partir de metadata da Subscription/Checkout (prioridade sobre mapa de preços). */
export function planFromStripeMetadata(meta: Record<string, unknown> | null | undefined): PlanTier | null {
  const raw = meta?.plan_tier ?? meta?.plan ?? meta?.planTier;
  const p = String(raw ?? "").toLowerCase();
  if (VALID.includes(p as PlanTier)) return p as PlanTier;
  return null;
}
