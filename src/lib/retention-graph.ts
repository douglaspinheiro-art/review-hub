type RetentionInput = {
  recoveredRevenue: number;
  activeOpportunities: number;
  unreadConversations: number;
  chs: number;
};

export type RetentionNode = {
  id: "recover" | "repeat" | "reactivate";
  label: string;
  score: number;
  reason: string;
};

function normalize(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function buildRetentionGraph(input: RetentionInput): RetentionNode[] {
  const recoverSignal = normalize(input.activeOpportunities, 0, 30) * 0.6 + normalize(input.unreadConversations, 0, 120) * 0.4;
  const repeatSignal = normalize(input.recoveredRevenue, 0, 150000) * 0.55 + normalize(input.chs, 0, 100) * 0.45;
  const reactivateSignal = normalize(input.unreadConversations, 0, 120) * 0.3 + (1 - normalize(input.chs, 0, 100)) * 0.7;

  return [
    {
      id: "recover",
      label: "Recuperar",
      score: Math.round(recoverSignal * 100),
      reason: "prioriza receita em risco de curto prazo",
    },
    {
      id: "repeat",
      label: "Recomprar",
      score: Math.round(repeatSignal * 100),
      reason: "sustenta crescimento de margem na base ativa",
    },
    {
      id: "reactivate",
      label: "Reativar",
      score: Math.round(reactivateSignal * 100),
      reason: "reduz perda silenciosa de clientes inativos",
    },
  ];
}
