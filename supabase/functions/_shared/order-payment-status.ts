/**
 * Source-of-truth mapping between each platform's native order status and our
 * internal `is_paid` semantics. Mirrors `docs/integration-status-matrix.md`.
 *
 * Rule: `is_paid = true` only when payment is **confirmed** by the platform.
 * "Faturado" / "processing" / "fulfilled" alone are NOT enough.
 */

export type SignaturePlatform =
  | "shopify"
  | "woocommerce"
  | "vtex"
  | "magento"
  | "tray"
  | "yampi"
  | "nuvemshop"
  | "shopee"
  | "custom";

const PAID_VALUES: Record<SignaturePlatform, ReadonlySet<string>> = {
  shopify: new Set(["paid", "partially_paid"]),
  woocommerce: new Set(["completed"]),
  vtex: new Set([
    "payment-approved",
    "invoiced",
    "handling",
    "ready-for-handling",
  ]),
  magento: new Set(["complete", "processing", "shipped"]),
  tray: new Set(["aprovado", "pago", "approved", "paid"]),
  yampi: new Set(["paid", "authorized"]),
  nuvemshop: new Set(["paid"]),
  // shopee + custom: defer to caller's existing logic — no strict matrix.
  shopee: new Set(["paid", "completed"]),
  custom: new Set(["paid", "completed", "approved"]),
};

const REFUNDED_VALUES: Record<SignaturePlatform, ReadonlySet<string>> = {
  shopify: new Set(["refunded", "partially_refunded", "voided"]),
  woocommerce: new Set(["refunded", "cancelled", "failed"]),
  vtex: new Set(["cancel", "canceled"]),
  magento: new Set(["closed", "canceled"]),
  tray: new Set(["cancelado", "estornado", "cancelled", "refunded"]),
  yampi: new Set(["refunded", "canceled"]),
  nuvemshop: new Set(["refunded", "voided", "cancelled"]),
  shopee: new Set(["cancelled", "refunded"]),
  custom: new Set(["cancelled", "refunded", "voided"]),
};

function pickStatus(
  platform: SignaturePlatform,
  raw: { status?: string | null; financial_status?: string | null; payment_status?: string | null },
): string {
  // Per-platform field priority. Falls back to whichever is present.
  if (platform === "shopify") return (raw.financial_status ?? raw.status ?? "").trim().toLowerCase();
  if (platform === "nuvemshop") return (raw.payment_status ?? raw.status ?? "").trim().toLowerCase();
  return (raw.status ?? raw.financial_status ?? raw.payment_status ?? "").trim().toLowerCase();
}

/**
 * Returns true when the order is in a confirmed-paid state for the given platform.
 * Strict: unknown / pending values return false.
 */
export function isOrderPaid(
  platform: SignaturePlatform,
  raw: { status?: string | null; financial_status?: string | null; payment_status?: string | null },
): boolean {
  const value = pickStatus(platform, raw);
  if (!value) return false;
  return PAID_VALUES[platform].has(value);
}

/** Returns true when the order is refunded / cancelled. */
export function isOrderRefunded(
  platform: SignaturePlatform,
  raw: { status?: string | null; financial_status?: string | null; payment_status?: string | null },
): boolean {
  const value = pickStatus(platform, raw);
  if (!value) return false;
  return REFUNDED_VALUES[platform].has(value);
}
