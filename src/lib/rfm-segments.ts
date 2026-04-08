/**
 * Aliases stored in customers_v3.rfm_segment (English + legacy Portuguese / variants).
 * Keep in sync with dashboard RFM and calculate-rfm edge function.
 */
export const RFM_ENGLISH_ALIASES: Record<string, string[]> = {
  champions: ["champions", "campeao", "campiao"],
  loyal: ["loyal", "loyal_customers", "fiel"],
  at_risk: ["at_risk", "cant_lose", "em_risco"],
  lost: ["lost", "hibernating", "perdido"],
  new: ["new", "new_customers", "novo", "promising", "promissor"],
};

export type RfmEnglishSegment = keyof typeof RFM_ENGLISH_ALIASES;

export function contactMatchesEnglishRfmSegment(
  raw: string | null | undefined,
  english: RfmEnglishSegment,
): boolean {
  const s = String(raw ?? "").toLowerCase();
  return (RFM_ENGLISH_ALIASES[english] ?? []).includes(s);
}

export function isValidRfmQuerySegment(v: string | null): v is RfmEnglishSegment {
  return v != null && Object.prototype.hasOwnProperty.call(RFM_ENGLISH_ALIASES, v);
}
