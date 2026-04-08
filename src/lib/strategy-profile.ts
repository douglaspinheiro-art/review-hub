export type PrimaryObjective = "recover" | "repeat" | "reactivate";
export type EcommerceVertical = "fashion" | "beauty" | "supplements" | "pets" | "generic";

export const OBJECTIVES: Array<{ id: PrimaryObjective; label: string; hint: string }> = [
  {
    id: "recover",
    label: "Recuperar receita em risco",
    hint: "Carrinho, PIX e boleto pendente",
  },
  {
    id: "repeat",
    label: "Aumentar recompra",
    hint: "Pós-compra e jornada de fidelização",
  },
  {
    id: "reactivate",
    label: "Reativar clientes inativos",
    hint: "Win-back orientado por RFM",
  },
];

export const VERTICALS: Array<{ id: EcommerceVertical; label: string; benchmarkHint: string }> = [
  {
    id: "fashion",
    label: "Moda",
    benchmarkHint: "janela curta de reposição e coleção",
  },
  {
    id: "beauty",
    label: "Beleza",
    benchmarkHint: "cadência recorrente de reposição",
  },
  {
    id: "supplements",
    label: "Suplementos",
    benchmarkHint: "alto potencial de assinatura/recompra",
  },
  {
    id: "pets",
    label: "Pet",
    benchmarkHint: "consumo frequente com baixa sazonalidade",
  },
  {
    id: "generic",
    label: "Outros",
    benchmarkHint: "playbook de retenção generalista",
  },
];

export type StrategyProfile = {
  objective: PrimaryObjective;
  vertical: EcommerceVertical;
};

const STORAGE_KEY = "ltv_strategy_profile";

export function saveStrategyProfile(profile: StrategyProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function loadStrategyProfile(): StrategyProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StrategyProfile>;
    if (!parsed.objective || !parsed.vertical) return null;
    return {
      objective: parsed.objective as PrimaryObjective,
      vertical: parsed.vertical as EcommerceVertical,
    };
  } catch {
    return null;
  }
}
