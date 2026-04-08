export type RevenueAction = {
  id: string;
  title: string;
  description: string;
  ownerRoute: string;
  priority: "alta" | "media" | "baixa";
  expectedImpact: number;
  effort: "baixo" | "medio" | "alto";
  reason: string;
  category: "recovery" | "retention" | "ops" | "reviews";
};

export type RevenueContext = {
  pendingCount: number;
  pendingValue: number;
  openConversations: number;
  totalUnread: number;
  activeOpportunities: number;
  revenueLast30: number;
  revGrowth: number;
  avgReadRate: number;
};

export type ChurnRiskSnapshot = {
  level: "baixo" | "medio" | "alto";
  score: number;
  estimatedAccountsAtRisk: number;
  estimatedRevenueAtRisk: number;
  mainDriver: string;
};

function score(priority: RevenueAction["priority"], effort: RevenueAction["effort"], impact: number) {
  const priorityWeight = priority === "alta" ? 1.3 : priority === "media" ? 1 : 0.8;
  const effortWeight = effort === "baixo" ? 1.2 : effort === "medio" ? 1 : 0.85;
  return impact * priorityWeight * effortWeight;
}

export function buildRevenueActions(ctx: RevenueContext): RevenueAction[] {
  const actions: RevenueAction[] = [];

  if (ctx.pendingCount > 0 || ctx.pendingValue > 0) {
    actions.push({
      id: "recover-opportunities",
      title: "Ativar recuperação imediata das oportunidades",
      description: `Existem ${ctx.pendingCount} oportunidades com potencial de caixa imediato.`,
      ownerRoute: "/dashboard/prescricoes",
      priority: "alta",
      expectedImpact: Math.max(ctx.pendingValue, 1200),
      effort: "baixo",
      reason: "Receita já identificada e não capturada.",
      category: "recovery",
    });
  }

  if (ctx.totalUnread >= 8 || ctx.openConversations >= 10) {
    actions.push({
      id: "inbox-sla",
      title: "Reduzir fila do Inbox e evitar perda por atraso",
      description: `${ctx.totalUnread} mensagens não lidas e ${ctx.openConversations} conversas abertas pedem ação.`,
      ownerRoute: "/dashboard/inbox",
      priority: "alta",
      expectedImpact: Math.round(Math.max(900, ctx.totalUnread * 65)),
      effort: "medio",
      reason: "Tempo de resposta impacta conversão e retenção.",
      category: "ops",
    });
  }

  if (ctx.avgReadRate < 35) {
    actions.push({
      id: "campaign-read-rate",
      title: "Melhorar leitura de campanhas com segmentação e copy",
      description: `Taxa de leitura atual em ${ctx.avgReadRate}% abaixo do ideal.`,
      ownerRoute: "/dashboard/campanhas",
      priority: "media",
      expectedImpact: 1400,
      effort: "medio",
      reason: "Leitura baixa reduz efeito de toda jornada.",
      category: "retention",
    });
  }

  if (ctx.revGrowth < 0 || ctx.revenueLast30 < 15000) {
    actions.push({
      id: "reactivation-rfm",
      title: "Disparar playbook de reativação por RFM",
      description: "Clientes em risco devem receber abordagem com janela e oferta corretas.",
      ownerRoute: "/dashboard/newsletter",
      priority: "media",
      expectedImpact: 1800,
      effort: "baixo",
      reason: "Reativação tende a melhorar NRR com custo baixo.",
      category: "retention",
    });
  }

  if (ctx.activeOpportunities > 0) {
    actions.push({
      id: "reviews-proof",
      title: "Converter provas sociais em receita com fluxo de reviews",
      description: "Ative coleta e uso de reviews no funil de recompra.",
      ownerRoute: "/dashboard/reviews",
      priority: "media",
      expectedImpact: 1100,
      effort: "baixo",
      reason: "Prova social acelera decisão e melhora conversão.",
      category: "reviews",
    });
  }

  return actions
    .sort((a, b) => score(b.priority, b.effort, b.expectedImpact) - score(a.priority, a.effort, a.expectedImpact))
    .slice(0, 5);
}

export function summarizeBenchmark(ctx: RevenueContext) {
  const readiness = ctx.pendingValue > 0 ? "acao_imediata" : "otimizacao";
  const execution = ctx.totalUnread > 12 ? "operacao_em_risco" : "operacao_estavel";
  const growthBand = ctx.revGrowth >= 20 ? "acelerado" : ctx.revGrowth >= 0 ? "estavel" : "reversao";

  return {
    readiness,
    execution,
    growthBand,
    score: Math.max(
      10,
      Math.min(
        100,
        60 +
          (ctx.revGrowth > 0 ? 12 : -8) +
          (ctx.avgReadRate >= 40 ? 10 : -6) +
          (ctx.totalUnread <= 6 ? 8 : -7) +
          (ctx.pendingCount === 0 ? 6 : -4)
      )
    ),
  };
}

export function buildChurnRiskSnapshot(ctx: RevenueContext): ChurnRiskSnapshot {
  const unreadPenalty = ctx.totalUnread > 10 ? 18 : ctx.totalUnread > 5 ? 10 : 4;
  const growthPenalty = ctx.revGrowth < 0 ? 20 : ctx.revGrowth < 8 ? 10 : 2;
  const readRatePenalty = ctx.avgReadRate < 28 ? 20 : ctx.avgReadRate < 40 ? 10 : 3;
  const pendingPenalty = ctx.pendingCount > 5 ? 16 : ctx.pendingCount > 0 ? 8 : 2;

  const score = Math.max(5, Math.min(100, unreadPenalty + growthPenalty + readRatePenalty + pendingPenalty));
  const level: ChurnRiskSnapshot["level"] = score >= 60 ? "alto" : score >= 35 ? "medio" : "baixo";

  const estimatedAccountsAtRisk = Math.max(3, Math.round((ctx.openConversations + ctx.pendingCount + ctx.totalUnread) * (score / 100)));
  const estimatedRevenueAtRisk = Math.round(
    Math.max(1200, (ctx.pendingValue * 0.5) + (ctx.revenueLast30 * (score / 100) * 0.08))
  );

  let mainDriver = "cadencia de execucao";
  if (ctx.revGrowth < 0) mainDriver = "queda de crescimento";
  else if (ctx.avgReadRate < 30) mainDriver = "baixa leitura de campanhas";
  else if (ctx.totalUnread > 10) mainDriver = "tempo de resposta no inbox";

  return {
    level,
    score,
    estimatedAccountsAtRisk,
    estimatedRevenueAtRisk,
    mainDriver,
  };
}
