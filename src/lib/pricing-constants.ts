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
  },
  scale: {
    name: "Scale",
    emoji: "⚡",
    base: 1997,
    successFeeRate: 0.01,
    maxContacts: 10000,
    includedWA: 2000,
    includedEmail: 15000,
    includedSMS: 3000,
    audience: "Lojas R$500k–3M/mês",
    cogsFixed: 1150,
    color: "emerald",
  },
};

export const BUNDLES = {
  wa: [
    { id: "wa_s", name: "WA +250", qty: 250, price: 79, costPerUnit: 0.036 },
    { id: "wa_m", name: "WA +1.000", qty: 1000, price: 247, costPerUnit: 0.036 },
    { id: "wa_l", name: "WA +5.000", qty: 5000, price: 997, costPerUnit: 0.036 },
  ],
  email: [
    { id: "em_s", name: "E-mail +10k", qty: 10000, price: 29, costPerUnit: 0.0055 },
    { id: "em_m", name: "E-mail +50k", qty: 50000, price: 97, costPerUnit: 0.0055 },
    { id: "em_l", name: "E-mail +200k", qty: 200000, price: 297, costPerUnit: 0.0055 },
  ],
  sms: [
    { id: "sms_s", name: "SMS +1.000", qty: 1000, price: 149, costPerUnit: 0.10 },
    { id: "sms_m", name: "SMS +5.000", qty: 5000, price: 549, costPerUnit: 0.10 },
    { id: "sms_l", name: "SMS +15.000", qty: 15000, price: 1297, costPerUnit: 0.10 },
  ],
};

export const CONTACT_PACK = { qty: 1000, price: 39, cost: 12 };

export const GW_FEE = 0.025;
export const WA_EXCESS_PRICE = 0.50;
export const EMAIL_EXCESS_PRICE = 0.01;
export const SMS_EXCESS_PRICE = 0.20;

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
