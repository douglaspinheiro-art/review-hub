/** Níveis para comparação de plano (UI, gating de rotas). Manter alinhado a `ProtectedRoute`. */
export const PLAN_LEVELS = { starter: 0, growth: 1, scale: 2, enterprise: 3 } as const;
export type PlanTier = keyof typeof PLAN_LEVELS;

export function planTierAtLeast(plan: string | undefined | null, min: PlanTier): boolean {
  const key = (plan ?? "starter").toLowerCase();
  const cur = key in PLAN_LEVELS ? PLAN_LEVELS[key as PlanTier] : 0;
  return cur >= PLAN_LEVELS[min];
}

/** Textos e flags só da página de planos — limites numéricos vêm sempre de `base`, `maxContacts`, etc. */
export type PlanPageCopy = {
  feeExamples: readonly number[];
  instances: string;
  users: string;
  journeys: string;
  rfm: string;
  chs: boolean | string;
  aiNegotiator: string;
  loyalty: boolean | string;
  support: string;
  revenueForecast: boolean;
  abPrescriptions: boolean;
  invoiceSuccessFeeSample: number;
  invoiceTotalExample: number;
};

export const PLANS = {
  starter: {
    name: "Starter",
    emoji: "🌱",
    base: 497,
    successFeeRate: 0.03,
    maxContacts: 1000,
    includedWA: 300,
    includedEmail: 2000,
    includedSMS: 0,
    audience: "Lojas R$30k–80k/mês",
    cogsFixed: 165,
    color: "slate",
    planPage: {
      feeExamples: [10_000, 30_000, 50_000] as const,
      instances: "1 loja",
      users: "2 usuários",
      journeys: "Até 3 automações",
      rfm: "Básico",
      chs: false,
      aiNegotiator: "30 conv./mês",
      loyalty: false,
      support: "WhatsApp",
      revenueForecast: false,
      abPrescriptions: false,
      invoiceSuccessFeeSample: 300,
      invoiceTotalExample: 797,
    } satisfies PlanPageCopy,
    landingDescription: "Para e-commerces em crescimento",
    landingFeatures: [
      "1.000 contatos",
      "300 mensagens WhatsApp/mês inclusas",
      "2.000 e-mails inclusos",
      "30 conversas IA/mês",
      "Até 3 automações",
      "Carrinho abandonado básico",
      "Suporte via WhatsApp",
    ],
  },
  growth: {
    name: "Growth",
    emoji: "🚀",
    base: 997,
    successFeeRate: 0.02,
    maxContacts: 5000,
    includedWA: 700,
    includedEmail: 7500,
    includedSMS: 300,
    audience: "Lojas R$80k–500k/mês",
    cogsFixed: 355,
    color: "indigo",
    planPage: {
      feeExamples: [50_000, 100_000, 200_000] as const,
      instances: "2 lojas",
      users: "Até 5 usuários",
      journeys: "Ilimitadas",
      rfm: "Completo",
      chs: "✓",
      aiNegotiator: "300 conv./mês",
      loyalty: "✓",
      support: "Prioritário",
      revenueForecast: true,
      abPrescriptions: true,
      invoiceSuccessFeeSample: 1000,
      invoiceTotalExample: 1997,
    } satisfies PlanPageCopy,
    landingDescription: "Para operações de alto volume",
    landingFeatures: [
      "5.000 contatos",
      "700 mensagens WhatsApp/mês inclusas",
      "300 SMS inclusos",
      "300 conversas IA/mês",
      "Automações ilimitadas",
      "Previsão de receita + A/B",
      "Programa de Fidelidade completo",
      "Suporte prioritário",
    ],
  },
  scale: {
    name: "Scale",
    emoji: "⚡",
    base: 2497,
    successFeeRate: 0.015,
    maxContacts: 20000,
    includedWA: 1500,
    includedEmail: 25000,
    includedSMS: 3000,
    audience: "Lojas R$500k–3M/mês",
    cogsFixed: 1025,
    color: "emerald",
    planPage: {
      feeExamples: [200_000, 500_000, 1_000_000] as const,
      instances: "Até 5 lojas",
      users: "Ilimitado",
      journeys: "Ilimitadas",
      rfm: "Completo + IA",
      chs: "Multi-loja",
      aiNegotiator: "Fair Use",
      loyalty: "✓",
      support: "White-label + API",
      revenueForecast: true,
      abPrescriptions: true,
      invoiceSuccessFeeSample: 3000,
      invoiceTotalExample: 5497,
    } satisfies PlanPageCopy,
    landingDescription: "Para operações em escala",
    landingFeatures: [
      "20.000 contatos",
      "1.500 mensagens WhatsApp/mês inclusas",
      "3.000 SMS inclusos",
      "IA Fair Use (Ilimitada)",
      "Multi-loja (até 5 lojas)",
      "White-label + API avançada",
      "Suporte e execução prioritária",
    ],
  },
};

export const BUNDLES = {
  wa: [
    { id: "wa_s", name: "WA +250", qty: 250, price: 199, costPerUnit: 0.036 },
    { id: "wa_m", name: "WA +1.000", qty: 1000, price: 699, costPerUnit: 0.036 },
    { id: "wa_l", name: "WA +5.000", qty: 5000, price: 2999, costPerUnit: 0.036 },
  ],
  email: [
    { id: "em_s", name: "E-mail +10k", qty: 10000, price: 129, costPerUnit: 0.0055 },
    { id: "em_m", name: "E-mail +50k", qty: 50000, price: 597, costPerUnit: 0.0055 },
    { id: "em_l", name: "E-mail +200k", qty: 200000, price: 2397, costPerUnit: 0.0055 },
  ],
  sms: [
    { id: "sms_s", name: "SMS +1.000", qty: 1000, price: 249, costPerUnit: 0.10 },
    { id: "sms_m", name: "SMS +5.000", qty: 5000, price: 1099, costPerUnit: 0.10 },
    { id: "sms_l", name: "SMS +15.000", qty: 15000, price: 2997, costPerUnit: 0.10 },
  ],
};

export const CONTACT_PACK = { qty: 1000, price: 39, cost: 12 };

export const GW_FEE = 0.025;
export const WA_EXCESS_PRICE = 0.50;
export const EMAIL_EXCESS_PRICE = 0.015;
export const SMS_EXCESS_PRICE = 0.22;

export const TARGET_MIN_GROSS_MARGIN = 50;
export const PLAN_KEYS = Object.keys(PLANS) as Array<keyof typeof PLANS>;
export const PLAN_LIMITS: Record<string, { contacts: number; messages: number }> = {
  starter: { contacts: PLANS.starter.maxContacts, messages: PLANS.starter.includedWA },
  growth: { contacts: PLANS.growth.maxContacts, messages: PLANS.growth.includedWA },
  scale: { contacts: PLANS.scale.maxContacts, messages: PLANS.scale.includedWA },
  enterprise: { contacts: -1, messages: -1 },
};

export function getAnnualPrice(monthlyBase: number, discountRate = 0.2) {
  return Math.round(monthlyBase * (1 - discountRate));
}

export function calcPlano(planKey: keyof typeof PLANS, { recovered, contactPacks, bundles }: { recovered: number, contactPacks?: number, bundles?: string[] }) {
  const p = PLANS[planKey];
  const allBundles = [...BUNDLES.wa, ...BUNDLES.email, ...BUNDLES.sms];

  const revBase = p.base;
  const revSuccess = recovered * p.successFeeRate;
  const revContacts = (contactPacks || 0) * CONTACT_PACK.price;

  let revBundles = 0;
  let cogsBundles = 0;
  
  (bundles || []).forEach(bid => {
    const b = allBundles.find(x => x.id === bid);
    if (b) {
      revBundles += b.price;
      cogsBundles += b.qty * b.costPerUnit;
    }
  });

  const revTotal = revBase + revSuccess + revContacts + revBundles;
  const cogsGW = revTotal * GW_FEE;
  const cogsTotal = p.cogsFixed + cogsBundles + (contactPacks || 0) * CONTACT_PACK.cost + cogsGW;
  const grossProfit = revTotal - cogsTotal;
  const grossMargin = revTotal > 0 ? (grossProfit / revTotal) * 100 : 0;

  return {
    revBase,
    revSuccess,
    revContacts,
    revBundles,
    revTotal,
    cogsFixed: p.cogsFixed,
    cogsBundles,
    cogsGW,
    cogsTotal,
    grossProfit,
    grossMargin,
  };
}

type CohortInput = {
  label: string;
  clients: Partial<Record<keyof typeof PLANS, number>>;
  recoveredByPlan: Partial<Record<keyof typeof PLANS, number>>;
};

export function calcCohortMargins(cohorts: CohortInput[]) {
  return cohorts.map((cohort) => {
    let revTotal = 0;
    let cogsTotal = 0;
    let profitTotal = 0;

    PLAN_KEYS.forEach((planKey) => {
      const clients = cohort.clients[planKey] ?? 0;
      const recovered = cohort.recoveredByPlan[planKey] ?? 0;
      if (clients <= 0) return;

      const result = calcPlano(planKey, { recovered });
      revTotal += result.revTotal * clients;
      cogsTotal += result.cogsTotal * clients;
      profitTotal += result.grossProfit * clients;
    });

    const grossMargin = revTotal > 0 ? (profitTotal / revTotal) * 100 : 0;
    return { ...cohort, revTotal, cogsTotal, profitTotal, grossMargin };
  });
}
