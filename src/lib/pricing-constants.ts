export const PLANS = {
  starter: {
    name: "Starter",
    emoji: "🌱",
    base: 447,
    successFeeRate: 0.03,
    maxContacts: 1000,
    includedWA: 150,
    includedEmail: 1500,
    includedSMS: 0,
    audience: "Lojas R$30k–80k/mês",
    cogsFixed: 165,
    color: "slate",
    landingDescription: "Para e-commerces em crescimento",
    landingFeatures: [
      "1.000 contatos",
      "150 mensagens WhatsApp/mês inclusas",
      "Flow Engine básico",
      "Carrinho abandonado",
      "RFM + segmentação básica",
      "Suporte via WhatsApp",
    ],
  },
  growth: {
    name: "Growth",
    emoji: "🚀",
    base: 897,
    successFeeRate: 0.02,
    maxContacts: 5000,
    includedWA: 500,
    includedEmail: 5000,
    includedSMS: 0,
    audience: "Lojas R$80k–500k/mês",
    cogsFixed: 355,
    color: "indigo",
    landingDescription: "Para operações de alto volume",
    landingFeatures: [
      "5.000 contatos",
      "500 mensagens WhatsApp/mês inclusas",
      "Jornadas ilimitadas",
      "CHS + previsão de receita",
      "Analytics avançado",
      "Suporte prioritário",
    ],
  },
  scale: {
    name: "Scale",
    emoji: "⚡",
    base: 2297,
    successFeeRate: 0.01,
    maxContacts: 10000,
    includedWA: 2000,
    includedEmail: 15000,
    includedSMS: 2000,
    audience: "Lojas R$500k–3M/mês",
    cogsFixed: 1025,
    color: "emerald",
    landingDescription: "Para operações em escala",
    landingFeatures: [
      "10.000 contatos",
      "2.000 mensagens WhatsApp/mês inclusas",
      "Multi-loja + agente IA",
      "Revenue Forecast completo",
      "Onboarding dedicado",
      "SLA prioritário",
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
