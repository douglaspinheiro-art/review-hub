export const LOYALTY_REASON_LABELS: Record<string, string> = {
  purchase: "Compra",
  review: "Avaliação",
  birthday: "Aniversário",
  referral: "Indicação",
  redemption: "Resgate",
  manual: "Ajuste manual",
};

export const LOYALTY_TIER_LABELS: Record<string, string> = {
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  diamond: "Diamante",
};

export function loyaltyReasonLabel(reason: string): string {
  return LOYALTY_REASON_LABELS[reason] ?? reason;
}

export function loyaltyTierLabel(tier: string): string {
  return LOYALTY_TIER_LABELS[tier.toLowerCase()] ?? tier;
}

/** Slug público para /pontos/:slug — min 3, max 40, a-z 0-9 e hífen. */
export function isValidLoyaltySlug(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);
}

export function normalizeLoyaltySlug(raw: string): string {
  return raw.trim().toLowerCase();
}
