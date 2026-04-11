import { RFM_ENGLISH_ALIASES, type RfmEnglishSegment } from "@/lib/rfm-segments";

/** Campos mínimos para classificar como na página Matriz RFM (banco + heurística). */
export type RfmClassifiableContact = {
  id: string;
  /** Algumas fontes (ex.: contacts legado) enviam status; customers_v3 pode omitir. */
  status?: string | null;
  rfm_frequency: number | null;
  rfm_monetary: number | null;
  rfm_segment: string | null;
  last_purchase_at: string | null;
  created_at: string | null;
};

const DB_SEGMENT_MAP: Record<string, RfmEnglishSegment> = (() => {
  const m: Record<string, RfmEnglishSegment> = {};
  (Object.keys(RFM_ENGLISH_ALIASES) as RfmEnglishSegment[]).forEach((en) => {
    for (const a of RFM_ENGLISH_ALIASES[en] ?? []) {
      m[a.toLowerCase()] = en;
    }
  });
  return m;
})();

export function buildMonetaryScores(contacts: RfmClassifiableContact[]): Map<string, number> {
  const map = new Map<string, number>();
  const bigContacts = [...contacts]
    .filter((c) => Number(c.rfm_monetary ?? 0) > 5)
    .sort((a, b) => Number(a.rfm_monetary) - Number(b.rfm_monetary));
  for (const c of contacts) {
    const num = Number(c.rfm_monetary ?? 0);
    if (c.rfm_monetary == null || num === 0) {
      map.set(c.id, 1);
    } else if (num <= 5 && num >= 1) {
      map.set(c.id, Math.max(1, Math.min(5, num)));
    } else if (bigContacts.length === 0) {
      map.set(c.id, 3);
    } else {
      const idx = bigContacts.findIndex((x) => x.id === c.id);
      const frac = bigContacts.length <= 1 ? 1 : idx / (bigContacts.length - 1);
      map.set(c.id, Math.min(5, Math.max(1, Math.round(1 + frac * 4))));
    }
  }
  return map;
}

export function classifyContact(
  c: RfmClassifiableContact,
  maxDaysInactive: number,
  monetary1to5: number,
): RfmEnglishSegment {
  if (c.rfm_segment) {
    const mapped = DB_SEGMENT_MAP[c.rfm_segment.toLowerCase()];
    if (mapped) return mapped;
  }

  const recencyDate = c.last_purchase_at ?? c.created_at ?? new Date().toISOString();
  const daysSincePurchase = (Date.now() - new Date(recencyDate).getTime()) / 86_400_000;
  const recencyScore = maxDaysInactive > 0 ? Math.max(0, 1 - daysSincePurchase / maxDaysInactive) : 1;
  const freqScore = c.rfm_frequency != null ? (c.rfm_frequency - 1) / 4 : 0;
  const valueScore = (monetary1to5 - 1) / 4;

  const isNew = freqScore <= 0.25 && daysSincePurchase < 90;
  if (isNew) return "new";

  const rfmScore = (recencyScore + freqScore + valueScore) / 3;

  if (rfmScore >= 0.55 && freqScore >= 0.75) return "champions";
  if (rfmScore >= 0.3) return "loyal";
  if ((c.status ?? "") === "inactive" || rfmScore < 0.1) return "lost";
  return "at_risk";
}

export type RfmSampleContext<T extends RfmClassifiableContact = RfmClassifiableContact> = {
  monetaryById: Map<string, number>;
  maxDaysInactive: number;
  maxFreq: number;
  maxMonetary: number;
  segmentOf: (c: T) => RfmEnglishSegment;
};

export function computeRfmSampleContext<T extends RfmClassifiableContact>(contacts: T[]): RfmSampleContext<T> {
  if (contacts.length === 0) {
    const emptyMap = new Map<string, number>();
    return {
      monetaryById: emptyMap,
      maxDaysInactive: 1,
      maxFreq: 1,
      maxMonetary: 1,
      segmentOf: () => "lost" as RfmEnglishSegment,
    };
  }

  const maxDaysInactive = Math.max(
    ...contacts.map((c) => {
      const d = c.last_purchase_at ?? c.created_at ?? new Date().toISOString();
      return (Date.now() - new Date(d).getTime()) / 86_400_000;
    }),
    1,
  );

  const monetaryById = buildMonetaryScores(contacts);

  const maxFreq = Math.max(...contacts.map((c) => c.rfm_frequency ?? 1), 1);
  const maxMonetary = Math.max(
    ...contacts.map((c) => monetaryById.get(c.id) ?? 1),
    1,
  );

  const segmentOf = (c: T) => {
    const m = monetaryById.get(c.id) ?? 1;
    return classifyContact(c, maxDaysInactive, m);
  };

  return { monetaryById, maxDaysInactive, maxFreq, maxMonetary, segmentOf };
}
