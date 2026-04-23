import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  TrendingUp, RefreshCw, ChevronRight, Sparkles,
  Calendar, Users, Zap, DollarSign,
  MousePointer2, Wifi, WifiOff,
  Flame, ChevronDown, Target, ArrowRight, CheckCircle2,
} from "lucide-react";
import {
  StreakMilestoneToast,
  MilestoneToast,
  WhatsAppPendingBanner,
  PrescricoesPendingBanner,
  NewSetupBanner,
  FirstWeekBanner,
} from "@/components/dashboard/DashboardBanners";
import { NPSModal } from "@/components/dashboard/NPSModal";
import { ActivationChecklist } from "@/components/dashboard/ActivationChecklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { QuickStartPlaybooks } from "@/components/dashboard/QuickStartPlaybooks";
import { ProblemCard, type ProblemProps } from "@/components/dashboard/ProblemCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ROIAttribution } from "@/components/dashboard/ROIAttribution";
import AIRecommendationWidget from "@/components/dashboard/AIRecommendationWidget";
import ISLCard from "@/components/dashboard/ISLCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useProblems, useDashboardHomeStats, useConversionBaseline, type OpportunityRow } from "@/hooks/useDashboard";
import { useEngagementTracking } from "@/hooks/useEngagementTracking";
import { useLoja } from "@/hooks/useConvertIQ";
import { usePrescriptionsPendingStats } from "@/hooks/useLTVBoost";
import { buildChurnRiskSnapshot, buildRevenueActions, summarizeBenchmark } from "@/lib/revenue-orchestrator";
import { getMoatSignals, trackMoatEvent } from "@/lib/moat-telemetry";
import { buildRetentionGraph } from "@/lib/retention-graph";
import { getPropensityOutput } from "@/lib/propensity-score";
import { ECOMMERCE_PLATFORM_CHIPS } from "@/lib/ecommerce-platforms";
import { PLANS } from "@/lib/pricing-constants";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import type { Json } from "@/integrations/supabase/types";

function dadosJsonObject(dados: Json | null | undefined): Record<string, unknown> {
  if (dados && typeof dados === "object" && !Array.isArray(dados)) return dados as Record<string, unknown>;
  return {};
}

function strFromRecord(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function pickFirstStr(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return "";
}

function asProblemTipo(raw: string | null | undefined): ProblemProps["tipo"] {
  const v = (raw ?? "").toLowerCase();
  if (v === "funil" || v === "produto" || v === "sazonal" || v === "reputacao") return v;
  return "funil";
}

function asProblemSeveridade(raw: string | null | undefined): ProblemProps["severidade"] {
  const n = (raw ?? "").toLowerCase();
  if (n === "critical" || n === "critico") return "critico";
  if (n === "high" || n === "alto") return "alto";
  if (n === "medium" || n === "medio") return "medio";
  if (n === "low" || n === "oportunidade" || n === "opportunity") return "oportunidade";
  if (n === "critico" || n === "alto" || n === "medio" || n === "oportunidade") return n;
  return "medio";
}

function asProblemStatus(raw: string | null | undefined): ProblemProps["status"] {
  const n = (raw ?? "novo").toLowerCase();
  if (n === "novo" || n === "snoozed" || n === "em_tratamento" || n === "resolvido" || n === "ignorado") return n;
  return "novo";
}

function opportunityRowToProblemProps(row: OpportunityRow): ProblemProps {
  const j = dadosJsonObject(row.dados_json);
  return {
    tipo: asProblemTipo(strFromRecord(j, "tipo") ?? row.type),
    titulo: pickFirstStr(strFromRecord(j, "titulo"), row.title),
    descricao: pickFirstStr(strFromRecord(j, "descricao"), row.description ?? undefined) || "Impacto imediato no lucro líquido.",
    severidade: asProblemSeveridade(strFromRecord(j, "severidade") ?? row.severity),
    impacto_estimado: typeof row.estimated_impact === "number" && Number.isFinite(row.estimated_impact) ? row.estimated_impact : 0,
    causa_raiz: pickFirstStr(strFromRecord(j, "causa_raiz"), row.root_cause ?? undefined) || undefined,
    detectado_em: pickFirstStr(
      typeof row.detected_at === "string" ? row.detected_at : undefined,
      strFromRecord(j, "detectado_em"),
    ) || new Date().toISOString(),
    status: asProblemStatus(row.status),
  };
}

export default function Dashboard() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [isSyncing, setIsSyncing] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNewSetup = searchParams.get("setup") === "complete" || searchParams.get("setup") === "novo";
  const isFirstWeek = searchParams.get("firstweek") === "true";
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: problemsQuery } = useProblems();
  const problems = problemsQuery?.items ?? [];
  const openOpportunitiesCount = problemsQuery?.totalCount ?? 0;
  const problemsValue = problemsQuery?.totalEstimatedImpact ?? 0;
  const lojaDash = useLoja();
  const storeIdDash = (lojaDash.data as { id?: string } | null)?.id;
  const { pendingCount: pendingRxCount, pendingValue: pendingRxValue } = usePrescriptionsPendingStats(storeIdDash);
  const queueIsPrescriptions = pendingRxCount > 0;
  const pendingCount = queueIsPrescriptions ? pendingRxCount : openOpportunitiesCount;
  const pendingValue = queueIsPrescriptions ? pendingRxValue : problemsValue;

  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    error: statsQueryError,
    refetch: refetchHomeStats,
  } = useDashboardHomeStats(period);
  const { data: baseline } = useConversionBaseline(period);

  const revenueRecovered = statsData?.revenueLast30 ?? 0;
  const revenueGrowth = statsData?.revGrowth ?? 0;

  const { data: whatsappConnections = [] } = useQuery({
    queryKey: ["whatsapp_connections_status", user?.id ?? null],
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [];
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("status")
        .eq("user_id", userId);
      return data || [];
    },
    enabled: !!user?.id,
  });

  const isWhatsAppConnected = whatsappConnections.some(c => c.status === "connected");

  const planKey = (profile?.plan ?? "starter") as keyof typeof PLANS;
  const monthlyToolEstimate =
    profile?.plan === "enterprise"
      ? PLANS.scale.cogsFixed
      : (PLANS[planKey]?.cogsFixed ?? PLANS.starter.cogsFixed);

  const handleSync = async () => {
    if (!storeIdDash) {
      toast.error("Associe uma loja para sincronizar os canais.");
      return;
    }
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("sincronizar-canal", {
        body: { store_id: storeIdDash },
      });
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: ["dashboard-home-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["conversion-baseline"] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_status"] });
      toast.success("Canais sincronizados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sincronizar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const [funnelSectionOpen, setFunnelSectionOpen] = useState(true);
  const [activitySectionOpen, setActivitySectionOpen] = useState(false);

  const {
    streak,
    streakMilestone,
    showNPS,
    milestone,
    dismissNPS,
    dismissMilestone,
    dismissStreakMilestone,
  } = useEngagementTracking(user?.id ?? null);

  const roi = useMemo(() => 
    revenueRecovered > 0 ? (revenueRecovered / Math.max(monthlyToolEstimate, 1)).toFixed(1) : "0"
  , [revenueRecovered, monthlyToolEstimate]);
  
  const stats = useMemo(() => [
    { 
      label: "LTV Boost ROI",  
      value: `${roi}x`,  
      trend: revenueGrowth, 
      icon: Zap, 
      color: "text-emerald-500",
      tooltip: "Retorno sobre o investimento do plano mensal (Recuperado / Custo do Plano)."
    },
    { 
      label: "Recuperado",     
      value: `R$ ${revenueRecovered.toLocaleString("pt-BR")}`, 
      trend: revenueGrowth, 
      icon: DollarSign, 
      color: "text-primary",
      tooltip: "Receita Influenciada: Vendas atribuídas a contatos que interagiram com suas campanhas ou automações."
    },
    { label: "Conversão",      value: `${(statsData?.conversionRate ?? 0).toFixed(2)}%`, trend: 0, icon: TrendingUp },
    { label: "Novos Clientes", value: (statsData?.newContactsLast30 ?? 0).toLocaleString("pt-BR"), trend: 0, icon: Users },
  ], [roi, revenueGrowth, revenueRecovered, statsData]);

  const conversionRate = Number(statsData?.conversionRate ?? 0);
  const conversionTarget = Number((lojaDash.data as { meta_conversao?: number } | null)?.meta_conversao ?? 2.5);
  const conversionGap = Math.max(0, conversionTarget - conversionRate);
  const conversionProgress = Math.min(100, Math.round((conversionRate / conversionTarget) * 100));
  const estimatedIncrementalRevenue = pendingValue;
  const projectedBaseRevenue = Number(statsData?.revenueLast30 ?? 0);
  const projectedWithBoostRevenue = projectedBaseRevenue + estimatedIncrementalRevenue;
  const dormantCustomers = Number(statsData?.atRiskCount ?? 0);

  const orchestratorContext = useMemo(() => ({
    pendingCount,
    pendingValue,
    openConversations: statsData?.openConversations ?? 0,
    totalUnread: statsData?.totalUnread ?? 0,
    activeOpportunities: statsData?.activeOpportunities ?? 0,
    revenueLast30: statsData?.revenueLast30 ?? 0,
    revGrowth: statsData?.revGrowth ?? 0,
    avgReadRate: statsData?.avgReadRate ?? 0,
    chs: statsData?.chs ?? 0,
  }), [pendingCount, pendingValue, statsData]);

  const dailyActions = useMemo(() => buildRevenueActions(orchestratorContext), [orchestratorContext]);
  const benchmark = useMemo(() => summarizeBenchmark(orchestratorContext), [orchestratorContext]);
  const churnRisk = useMemo(() => buildChurnRiskSnapshot(orchestratorContext), [orchestratorContext]);
  const moatSignals = useMemo(() => getMoatSignals(), []);
  const retentionGraph = useMemo(() => buildRetentionGraph({
    recoveredRevenue: orchestratorContext.revenueLast30,
    activeOpportunities: orchestratorContext.activeOpportunities,
    unreadConversations: orchestratorContext.totalUnread,
    chs: orchestratorContext.chs,
  }), [orchestratorContext]);
  const propensity = useMemo(() => getPropensityOutput(retentionGraph), [retentionGraph]);

  const periodPhrase = useMemo(() => 
    period === 7 ? "últimos 7 dias" : period === 30 ? "últimos 30 dias" : "últimos 90 dias"
  , [period]);

  const dashboardStory = useMemo(() => {
    if (!isWhatsAppConnected) {
      return {
        title: "Conecte o WhatsApp para recuperar vendas",
        body: "Campanhas, automações e prescrições precisam de um número conectado. É no WhatsApp que o cliente responde e o pedido volta.",
        ctaLabel: "Ir para WhatsApp",
        ctaPath: "/dashboard/whatsapp" as const,
      };
    }
    if (pendingCount > 0 && pendingValue > 0) {
      const title = queueIsPrescriptions
        ? `${pendingCount} ${pendingCount === 1 ? "prescrição aguardando aprovação" : "prescrições aguardando aprovação"}`
        : `${pendingCount} ${pendingCount === 1 ? "recomendação aguardando você" : "recomendações aguardando você"}`;
      return {
        title,
        body: `Estimamos cerca de R$ ${pendingValue.toLocaleString("pt-BR")} em impacto ainda não capturado. Nos ${periodPhrase}, você já registrou R$ ${revenueRecovered.toLocaleString("pt-BR")} em receita influenciada.`,
        ctaLabel: "Revisar prescrições",
        ctaPath: "/dashboard/prescricoes" as const,
      };
    }
    if (revenueRecovered > 0) {
      return {
        title: "Sua operação está gerando resultado",
        body: `Nos ${periodPhrase}, a receita influenciada soma R$ ${revenueRecovered.toLocaleString("pt-BR")}.`,
        ctaLabel: "Ver prescrições",
        ctaPath: "/dashboard/prescricoes" as const,
      };
    }
    return {
      title: "Comece a encher este painel com ação",
      body: `Todos os números desta página usam os ${periodPhrase}. Integre a loja e conecte o WhatsApp para começar.`,
      ctaLabel: "Abrir prescrições",
      ctaPath: "/dashboard/prescricoes" as const,
    };
  }, [isWhatsAppConnected, pendingCount, pendingValue, revenueRecovered, periodPhrase, queueIsPrescriptions]);

  if (statsLoading && !statsData) {
    return <DashboardSkeleton />;
  }

  return (
    <>
      <div className="space-y-10 pb-28 md:pb-20">
        {showNPS && <NPSModal onClose={dismissNPS} />}

        {streakMilestone && (
          <StreakMilestoneToast message={streakMilestone} onDismiss={dismissStreakMilestone} />
        )}

        {milestone && (
          <MilestoneToast message={milestone} onDismiss={dismissMilestone} />
        )}

        {statsError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-destructive">
              {statsQueryError instanceof Error ? statsQueryError.message : "Erro ao carregar métricas da home."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetchHomeStats()}>
              Tentar novamente
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-border/10 pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-black font-syne tracking-tighter uppercase italic">
              Radar de <span className="text-primary">Lucro</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Resumo da sua operação de e-commerce nos <span className="font-semibold text-foreground">{periodPhrase}</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="bg-muted/50 p-1.5 rounded-2xl flex border border-border/20">
              {([7, 30, 90] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 text-[10px] font-black px-4 rounded-xl transition-all",
                    period === p && "shadow-sm bg-background"
                  )}
                  onClick={() => setPeriod(p)}
                >
                  {p}D
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 font-black text-[10px] uppercase tracking-widest gap-2 rounded-xl border-2 px-4 hover:bg-primary hover:text-primary-foreground transition-all"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} /> Sincronizar
            </Button>
          </div>
        </div>

        <Card className="p-6 md:p-8 rounded-2xl border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest",
              isWhatsAppConnected
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25"
                : "bg-amber-500/10 text-amber-600 border-amber-500/25"
            )}>
              {isWhatsAppConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isWhatsAppConnected ? "WhatsApp conectado" : "WhatsApp pendente"}
            </div>
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-border/60">
              Janela: {periodPhrase}
            </Badge>
            {streak > 1 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-600">
                <Flame className="w-3 h-3" />
                {streak} dias seguidos
              </div>
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground leading-snug max-w-3xl">
            {dashboardStory.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-3xl">
            {dashboardStory.body}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Button
              onClick={() => navigate(dashboardStory.ctaPath)}
              className="h-11 px-6 bg-primary hover:bg-primary/90 font-black text-[11px] gap-2 rounded-2xl shadow-lg shadow-primary/20 uppercase tracking-wide"
            >
              <Zap className="w-4 h-4 fill-primary-foreground" />
              {dashboardStory.ctaLabel}
            </Button>
            {pendingCount > 0 && dashboardStory.ctaPath === "/dashboard/prescricoes" && (
              <span className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{pendingCount}</span> na fila
                {pendingValue > 0 && (
                  <> · potencial <span className="font-bold text-foreground">R$ {pendingValue.toLocaleString("pt-BR")}</span></>
                )}
              </span>
            )}
          </div>
        </Card>

        {isNewSetup && !isFirstWeek && (
          <NewSetupBanner
            isWhatsAppConnected={isWhatsAppConnected}
            roi={roi}
            pendingCount={pendingCount}
          />
        )}

        {!isWhatsAppConnected && !isNewSetup && !isFirstWeek && (
          <WhatsAppPendingBanner />
        )}

        {isFirstWeek && (
          <FirstWeekBanner
            revenueLast30={statsData?.revenueLast30 ?? 0}
            roi={roi}
            pendingCount={pendingCount}
          />
        )}

        {!isFirstWeek && !isNewSetup && pendingCount > 0 && (
          <PrescricoesPendingBanner
            pendingCount={pendingCount}
            pendingValue={pendingValue}
            queueKind={queueIsPrescriptions ? "prescriptions" : "opportunities"}
          />
        )}

        <ActivationChecklist />
        <QuickStartPlaybooks />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ErrorBoundary>
            <ISLCard />
          </ErrorBoundary>
          <ErrorBoundary>
            <AIRecommendationWidget />
          </ErrorBoundary>
        </div>

        <Collapsible
          open={funnelSectionOpen}
          onOpenChange={setFunnelSectionOpen}
          className="space-y-4"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/50 bg-card/50 px-4 py-3 text-left transition-colors hover:bg-card/80"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Análise</p>
                <p className="font-black text-sm tracking-tight">Funil, baseline e Revenue OS</p>
                <p className="text-xs text-muted-foreground">CHS, ROI, métricas e oportunidades na base</p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                  funnelSectionOpen && "rotate-180"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-10 pt-2">
        {baseline && (
          <Card className="p-5 rounded-2xl border border-border/60 bg-card/60">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Baseline de Conversao</p>
                <p className="text-xs text-muted-foreground">Leitura, resposta, conversao, SLA e receita por mensagem</p>
              </div>
              <Badge className="bg-primary/10 text-primary border-none text-[9px] font-black uppercase tracking-widest">
                {period} dias
              </Badge>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-xl border bg-background p-3">
                <p className="text-lg font-black">{baseline.replyRate.toFixed(1)}%</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Taxa de resposta</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-lg font-black">{baseline.conversionRate.toFixed(1)}%</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Conversao por envio</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-lg font-black">
                  {baseline.revenuePerMessage.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Receita por mensagem</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className="text-lg font-black">{baseline.sla.compliance.toFixed(1)}%</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">SLA cumprido</p>
              </div>
              <div className="rounded-xl border bg-background p-3">
                <p className={cn("text-lg font-black", baseline.replyRateDelta >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {baseline.replyRateDelta >= 0 ? "+" : ""}
                  {baseline.replyRateDelta.toFixed(1)}%
                </p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Delta resposta</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6 rounded-3xl border-primary/20 bg-card/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Revenue OS diario</p>
              <h2 className="text-xl font-black">Acoes de receita hoje</h2>
              <p className="text-xs text-muted-foreground">
                Priorizacao automatica por impacto esperado, urgencia operacional e potencial de retencao.
              </p>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20">
              Potencial total: R$ {dailyActions.reduce((s, a) => s + a.expectedImpact, 0).toLocaleString("pt-BR")}
            </Badge>
          </div>
          <div className="grid lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 space-y-3">
              {dailyActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => {
                    void trackMoatEvent("recommendation_clicked", { recommendation_id: action.id, route: action.ownerRoute });
                    navigate(action.ownerRoute);
                  }}
                  className="w-full text-left rounded-2xl border bg-background/70 p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm">{action.title}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                      {action.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{action.reason}</span>
                    <span className="font-bold">R$ {action.expectedImpact.toLocaleString("pt-BR")}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="lg:col-span-2 space-y-3">
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Benchmark da coorte</p>
                <p className="text-3xl font-black mt-1">{benchmark.score}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Execucao: <strong>{benchmark.execution}</strong> · Crescimento: <strong>{benchmark.growthBand}</strong>
                </p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Risco de churn (conta)</p>
                <div className="flex items-end justify-between mt-1">
                  <p className="text-3xl font-black">{churnRisk.score}</p>
                  <Badge
                    className={cn(
                      "border",
                      churnRisk.level === "alto" && "bg-red-500/10 text-red-500 border-red-500/30",
                      churnRisk.level === "medio" && "bg-amber-500/10 text-amber-500 border-amber-500/30",
                      churnRisk.level === "baixo" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                    )}
                  >
                    {churnRisk.level}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Driver: <strong>{churnRisk.mainDriver}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  {churnRisk.estimatedAccountsAtRisk} contas em risco · R$ {churnRisk.estimatedRevenueAtRisk.toLocaleString("pt-BR")} de receita sensivel
                </p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sinais proprietarios (30d)</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">Playbooks</p>
                    <p className="font-bold">{moatSignals.playbooks}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">Recomendacoes</p>
                    <p className="font-bold">{moatSignals.recommendations}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">Envios newsletter</p>
                    <p className="font-bold">{moatSignals.newsletterSends}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">Uso de IA</p>
                    <p className="font-bold">{moatSignals.aiUsage}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Retention graph e propensao</p>
                <div className="space-y-2 mt-2">
                  {retentionGraph.map((node) => (
                    <div key={node.id} className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{node.label}</span>
                        <span className="font-black">{node.score}/100</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{node.reason}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-3">
                  Melhor proxima acao: <span className="font-bold">{propensity.bestNode.label}</span>{" "}
                  <span className="text-muted-foreground">(confianca {propensity.confidence}% · {propensity.band})</span>
                </p>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Relatorio semanal embutido</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Envie automaticamente desempenho, ganhos e prioridades para equipe, socios ou agencia.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => navigate("/dashboard/relatorios")}
                  >
                    <Calendar className="w-3.5 h-3.5" /> Ver relatorios
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => navigate("/dashboard/afiliados")}
                  >
                    Programa de parceiros
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2">Saúde da sua base de clientes</p>
            </div>
            <div onClick={() => navigate("/dashboard/funil")} className="cursor-pointer group">
              <ErrorBoundary>
              <CHSGauge
                score={statsData?.chs ?? 0}
                label={statsData?.chsLabel ?? "Sem dados"}
                breakdown={statsData?.chsBreakdown}
                historico={statsData?.chsHistory}
                className="h-full border-none shadow-2xl shadow-primary/5 bg-card/50 backdrop-blur-xl group-hover:scale-[1.02] transition-transform duration-500"
              />
              </ErrorBoundary>
            </div>

            <Card className="p-6 bg-primary border-none shadow-2xl shadow-primary/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                <Target className="w-20 h-20 text-white" />
              </div>
              <h3 className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-4">Meta de Conversão</h3>
              <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-end">
                  <span className="text-3xl font-black text-white font-syne italic">
                    {conversionRate.toFixed(1)}% <span className="text-xs font-medium text-white/50">/ {conversionTarget.toFixed(1)}%</span>
                  </span>
                  <Badge className="bg-white/20 text-white border-none font-black text-[10px]">EM PROGRESSO</Badge>
                </div>
                <div className="h-2.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full bg-white relative" style={{ width: `${conversionProgress}%` }}>
                    <div className="absolute top-0 right-0 h-full w-8 bg-white/20 animate-pulse" />
                  </div>
                </div>
                <p className="text-[10px] text-white/80 font-bold leading-relaxed">
                  Você está a <span className="underline decoration-2">{conversionGap.toFixed(1)}%</span> da meta, com potencial de recuperar mais <span className="font-black">R$ {estimatedIncrementalRevenue.toLocaleString("pt-BR")}</span>.
                </p>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-8">
            <ErrorBoundary>
              <ROIAttribution
                revenue={revenueRecovered}
                growth={revenueGrowth}
                period={period}
              />
            </ErrorBoundary>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((s) => (
                <MetricCard
                  key={s.label}
                  label={s.label}
                  value={s.value}
                  trend={s.trend}
                  icon={s.icon}
                  tooltip={s.tooltip}
                  className={cn(
                    "border-none bg-card/50 shadow-xl shadow-black/5 hover:bg-card transition-all",
                    s.color
                  )}
                />
              ))}
            </div>

            <div className="bg-[#0A0A0F] border border-white/5 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -mr-32 -mt-32 blur-[80px]" />
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div className="space-y-4 max-w-md text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <Badge className="bg-amber-500 text-black border-none font-black text-[9px] uppercase px-2">Oportunidade de Ouro</Badge>
                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Gerado pela IA LTV Boost
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-white font-syne tracking-tight leading-tight italic uppercase">
                    Identificamos <span className="text-primary underline">R$ {estimatedIncrementalRevenue.toLocaleString("pt-BR")}</span> em oportunidades ativas.
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Priorização feita com base em sinais reais de abandono e receita estimada por impacto.
                  </p>
                </div>
                <div className="flex flex-col gap-3 w-full md:w-auto">
                  <Button
                    onClick={() => navigate("/dashboard/prescricoes")}
                    className="h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-primary/20 gap-3 group"
                  >
                    Recuperar agora <Zap className="w-4 h-4 fill-primary-foreground group-hover:scale-125 transition-transform" />
                  </Button>
                  <p className="text-[9px] text-center text-white/30 font-bold uppercase tracking-widest italic">Tempo de execução: 2 segundos</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card/50 border border-border/10 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <MousePointer2 className="w-5 h-5 text-primary" />
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black border-primary/20 text-primary">RETENÇÃO</Badge>
                </div>
                <h4 className="font-black text-sm uppercase tracking-tight mb-1">Clientes Hibernando</h4>
                <p className="text-xs text-muted-foreground">{dormantCustomers.toLocaleString("pt-BR")} clientes em risco de churn no período.</p>
                <Button
                  variant="ghost"
                  className="w-full mt-4 h-9 text-[9px] font-black uppercase tracking-widest gap-2 hover:bg-primary/10 hover:text-primary rounded-xl"
                  onClick={() => navigate("/dashboard/contatos")}
                >
                  Reativar com IA <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          open={activitySectionOpen}
          onOpenChange={setActivitySectionOpen}
          className="space-y-4"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/50 bg-card/50 px-4 py-3 text-left transition-colors hover:bg-card/80"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Tempo real</p>
                <p className="font-black text-sm tracking-tight">Atividade, projeção e radar</p>
                <p className="text-xs text-muted-foreground">Capturas ao vivo e lista de oportunidades</p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                  activitySectionOpen && "rotate-180"
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-10 pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h2 className="text-2xl font-black font-syne tracking-tighter uppercase italic">Capturas <span className="text-primary">ao vivo</span></h2>
              <p className="text-xs text-muted-foreground mt-1">Ações automáticas executadas pela IA agora mesmo.</p>
            </div>
            <ErrorBoundary>
              <ActivityFeed />
            </ErrorBoundary>
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-black font-syne tracking-tighter uppercase italic">Projeção</h2>
              <p className="text-xs text-muted-foreground mt-1">Potencial não capturado este mês.</p>
            </div>
            <Card className="p-6 bg-[#0A0A0F] border-none shadow-2xl rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-20 h-20 text-white" />
              </div>
              <h3 className="font-black text-xs uppercase tracking-widest mb-6 text-white/40 flex items-center gap-2 italic">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Projeção de Lucro
              </h3>
              <div className="space-y-6 relative z-10">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Base Atual</span>
                    <span className="text-sm font-black text-white font-mono tracking-tighter">R$ {projectedBaseRevenue.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-white/20" style={{ width: projectedBaseRevenue > 0 ? "65%" : "10%" }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Com LTV Boost</span>
                    <span className="text-lg font-black font-syne tracking-tighter">R$ {projectedWithBoostRevenue.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="h-2 bg-emerald-500/10 rounded-full overflow-hidden border border-emerald-500/20">
                    <div className="h-full bg-emerald-500 relative shadow-[0_0_15px_rgba(16,185,129,0.5)]" style={{ width: projectedWithBoostRevenue > 0 ? "90%" : "15%" }}>
                      <div className="absolute top-0 right-0 h-full w-12 bg-white/30 skew-x-[-20deg] animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-400 font-bold text-right italic">+R$ {estimatedIncrementalRevenue.toLocaleString("pt-BR")} potencial mensal</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full mt-8 border-white/10 hover:bg-white/5 text-white/70 font-black text-[10px] uppercase tracking-widest h-12 rounded-2xl transition-all"
                onClick={() => navigate("/dashboard/relatorios")}
              >
                Ver Relatório de Perda
              </Button>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-black font-syne tracking-tighter uppercase italic">Radar de <span className="text-primary underline">Oportunidades</span></h2>
              <p className="text-xs text-muted-foreground">Ações baseadas em comportamento real detectado agora.</p>
            </div>
            <Button variant="ghost" onClick={() => navigate("/dashboard/prescricoes")} className="text-muted-foreground font-black text-[10px] uppercase tracking-widest gap-2 h-auto hover:bg-transparent hover:text-primary">
              Histórico completo <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="bg-gradient-to-br from-indigo-500/10 to-primary/5 border border-primary/20 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-24 h-24 text-primary" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/20 text-primary border-none font-black text-[9px] uppercase tracking-widest px-2">AI LTV PREDICTOR</Badge>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Radar de Recompra</span>
                  </div>
                  <h3 className="text-2xl font-black font-syne tracking-tighter uppercase italic">
                    <span className="text-primary">{statsData?.idealPurchaseCount ?? 0} clientes</span> no momento ideal de compra
                  </h3>
                  <div className="grid grid-cols-3 gap-6 pt-2">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Potencial de Receita</p>
                      <p className="text-xl font-black font-syne">R$ {(statsData?.estimatedRevenue ?? 0).toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Risco de Churn</p>
                      <p className="text-xl font-black font-syne text-red-500">{statsData?.atRiskCount ?? 0} clientes</p>
                    </div>
                    <div className="flex items-end pb-1">
                      <Button size="sm" className="h-9 font-bold rounded-xl gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/20" onClick={() => navigate("/dashboard/campanhas")}>
                        Ativar Campanha <Zap className="w-3.5 h-3.5 fill-current" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {openOpportunitiesCount > 0 ? (
                <>
                  {problems.map((p) => (
                    <ProblemCard
                      key={p.id}
                      {...opportunityRowToProblemProps(p)}
                      onVer={() => navigate("/dashboard/prescricoes")}
                      onAprovar={() => navigate("/dashboard/prescricoes")}
                    />
                  ))}
                  {openOpportunitiesCount > problems.length && (
                    <p className="text-center text-[11px] text-muted-foreground py-2">
                      A mostrar as {problems.length} mais recentes de{" "}
                      {openOpportunitiesCount.toLocaleString("pt-BR")} oportunidades abertas. Ver todas em Prescrições.
                    </p>
                  )}
                </>
              ) : (
                <div className="bg-card/50 border border-dashed border-border/50 rounded-2xl p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="font-bold">Tudo em ordem!</h3>
                  <p className="text-sm text-muted-foreground">Nenhuma oportunidade crítica detectada agora.</p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-card/30 border border-border/20 rounded-2xl p-4 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Integra com</p>
                <div className="flex flex-wrap gap-2">
                  {ECOMMERCE_PLATFORM_CHIPS.map((p) => (
                    <span key={p} className="px-2.5 py-1 rounded-lg bg-muted/40 text-[10px] font-black text-muted-foreground border border-border/30">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-lg border-t border-border z-50">
        <Button
          className="w-full h-14 font-black bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/20 gap-2 text-sm"
          onClick={() => navigate("/dashboard/prescricoes")}
        >
          <Zap className="w-5 h-5 fill-primary-foreground" />
          {queueIsPrescriptions
            ? `${pendingCount} ${pendingCount === 1 ? "Prescrição" : "Prescrições"}`
            : `${pendingCount} ${pendingCount === 1 ? "Recomendação" : "Recomendações"}`}
          {" "}— R$ {pendingValue.toLocaleString("pt-BR")} a recuperar
        </Button>
      </div>
    </>
  );
}
