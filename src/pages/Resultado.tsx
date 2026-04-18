import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, TrendingUp, AlertCircle, Loader2, Sparkles, ArrowRight, Check, Lock, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { recommendPlan } from "@/lib/plan-recommendation";
import { PLANS } from "@/lib/pricing-constants";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";

type DiagnosticData = {
  resumo?: string;
  perda_principal?: string;
  percentual_explicado?: number;
  problemas?: Array<{
    titulo: string;
    descricao: string;
    severidade: string;
    impacto_reais: number;
  }>;
  recomendacoes?: Array<{
    titulo: string;
    descricao: string;
    esforco: string;
    impacto_pp: number;
    prazo_semanas: number;
    tipo: string;
  }>;
};

export default function Resultado() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isActive = profile?.subscription_status === "active";

  const [loading, setLoading] = useState(true);
  const [missingDiagnostic, setMissingDiagnostic] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [chs, setChs] = useState(0);
  const [chsLabel, setChsLabel] = useState("Regular");
  const [storeName, setStoreName] = useState("Sua Loja");
  const [persistedPlan, setPersistedPlan] = useState<"growth" | "scale" | null>(null);

  /** Aguarda o insert em `diagnostics_v3` (pós-/analisando) sem mandar o usuário para /dashboard/diagnostico (paywall). */
  const POLL_MS = 1000;
  const POLL_MAX_ATTEMPTS = 45;

  useEffect(() => {
    let cancelled = false;

    async function fetchDiagnostic() {
      if (!user?.id) return;

      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if ((storeData as { name?: string } | null)?.name) {
        setStoreName((storeData as { name: string }).name);
      }

      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;

        const { data: diagData } = await supabase
          .from("diagnostics_v3")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (diagData) {
          setDiagnostic(diagData.diagnostic_json as DiagnosticData);
          setChs(diagData.chs ?? 47);
          setChsLabel(diagData.chs_label ?? "Regular");
          const rp = (diagData as { recommended_plan?: string | null }).recommended_plan;
          if (rp === "growth" || rp === "scale") setPersistedPlan(rp);
          setLoading(false);
          setMissingDiagnostic(false);
          void trackFunnelEvent({
            event: "diagnostic_viewed",
            metadata: { has_diagnostic: true, chs: diagData?.chs ?? null },
          });
          return;
        }

        if (attempt < POLL_MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      }

      if (!cancelled) {
        setMissingDiagnostic(true);
        setLoading(false);
        void trackFunnelEvent({
          event: "diagnostic_viewed",
          metadata: { has_diagnostic: false, reason: "not_found_after_poll" },
        });
      }
    }

    void fetchDiagnostic();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Compute loss from funnel data — meta_conversao = benchmark de setor; taxa_conversao = CVR medida (payload novo)
  const rawFunnel = sessionStorage.getItem("ltv_funnel_data");
  const funnel = rawFunnel ? JSON.parse(rawFunnel) : null as {
    ticket_medio?: number;
    visitantes?: number;
    pedido?: number;
    meta_conversao?: number;
    taxa_conversao?: number;
  } | null;
  const ticketMedio = funnel?.ticket_medio || 250;
  const visitantesNum = funnel?.visitantes || 12400;
  const pedidosNum = funnel?.pedido ?? 174;
  const hasTaxaConversaoField = typeof funnel?.taxa_conversao === "number";
  const derivedCvrPct =
    visitantesNum > 0 ? (pedidosNum / visitantesNum) * 100 : null;
  const taxaConversaoAtual =
    derivedCvrPct !== null
      ? derivedCvrPct
      : (hasTaxaConversaoField ? Number(funnel?.taxa_conversao) : 1.4);

  const rawBench = Number(funnel?.meta_conversao);
  /** Payloads antigos gravavam a CVR medida em meta_conversao; detectar e usar default de benchmark. */
  let benchmarkConversao = 2.5;
  if (hasTaxaConversaoField) {
    benchmarkConversao = Number.isFinite(rawBench) ? rawBench : 2.5;
  } else if (
    derivedCvrPct !== null &&
    Number.isFinite(rawBench) &&
    Math.abs(rawBench - derivedCvrPct) < 0.2
  ) {
    benchmarkConversao = 2.5;
  } else if (Number.isFinite(rawBench)) {
    benchmarkConversao = rawBench;
  }

  const perdaMensal = Math.max(
    0,
    Math.round(((benchmarkConversao / 100) - (taxaConversaoAtual / 100)) * visitantesNum * ticketMedio),
  );

  const computed = recommendPlan({
    chs,
    perdaMensal,
    problemas: diagnostic?.problemas,
  });
  // Prefer persisted recommendation from DB (consistency across /resultado and /planos)
  const recommendation = persistedPlan
    ? { tier: persistedPlan, reason: computed.reason }
    : computed;
  const recommendedPlan = PLANS[recommendation.tier];

  useEffect(() => {
    if (!loading && diagnostic) {
      void trackFunnelEvent({
        event: "plan_recommended",
        recommendedPlan: recommendation.tier,
        metadata: { chs, perdaMensal },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, recommendation.tier]);

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleSubscribe = async (planKey: "starter" | "growth" | "scale") => {
    if (checkoutLoading) return;
    setCheckoutLoading(planKey);
    void trackFunnelEvent({
      event: "checkout_started",
      recommendedPlan: recommendation.tier,
      selectedPlan: planKey,
      metadata: { source: "resultado_inline", chs, perdaMensal, billing_cycle: billingCycle },
    });
    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-create-preference", {
        body: { plan_key: planKey, billing_cycle: billingCycle },
      });
      if (error) throw error;
      const url = (data as { init_point?: string; sandbox_init_point?: string } | null)?.init_point
        ?? (data as { sandbox_init_point?: string } | null)?.sandbox_init_point;
      if (!url) throw new Error("URL de pagamento não retornada.");
      window.location.href = url;
    } catch (e) {
      console.error("[resultado] checkout error", e);
      // Fallback: leva para /planos preservando o tier selecionado
      navigate(`/planos?recommended=${planKey}&from=diagnostico&cycle=${billingCycle}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground max-w-sm">Carregando seu diagnóstico…</p>
      </div>
    );
  }

  if (missingDiagnostic || !diagnostic) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center gap-6 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <div className="space-y-2 max-w-md">
          <h1 className="text-2xl font-black font-syne tracking-tighter">Diagnóstico ainda não disponível</h1>
          <p className="text-sm text-muted-foreground">
            Não encontramos seu diagnóstico salvo. Isso pode acontecer se a análise ainda estiver finalizando ou se houve uma falha ao salvar.
          </p>
        </div>
        <Button
          size="lg"
          className="font-black rounded-xl gap-2"
          onClick={() => navigate("/analisando", { replace: true })}
        >
          Tentar gerar novamente <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  const problemas = diagnostic?.problemas || [];
  const recomendacoes = diagnostic?.recomendacoes || [];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-20">
      {/* Top Header */}
      <div className="border-b border-[#1E1E2E] bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </div>
          {isActive ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="font-bold rounded-xl h-9 gap-1"
            >
              Ir para o painel <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                document.getElementById("planos-inline")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="font-bold rounded-xl h-9 gap-1"
            >
              Ativar plano {recommendedPlan.name} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-12 space-y-16">
        {/* CHS Block */}
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black font-syne tracking-tighter uppercase italic">
              Diagnóstico: {storeName}
            </h1>
            <p className="text-muted-foreground text-sm">
              Baseado em {visitantesNum.toLocaleString("pt-BR")} visitantes · {pedidosNum} pedidos · Taxa de conversão {taxaConversaoAtual.toFixed(2)}%
            </p>
          </div>

          <div className="flex justify-center">
            <CHSGauge
              score={chs}
              label={chsLabel}
              className="w-full max-w-sm border-0 bg-transparent"
            />
          </div>
        </div>

        {/* Loss Block */}
        {perdaMensal > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <AlertCircle className="w-16 h-16 text-red-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-widest text-red-500/80">Você está perdendo</p>
              <div className="text-5xl font-black font-jetbrains text-red-500 tracking-tighter">
                R$ {perdaMensal.toLocaleString("pt-BR")} <span className="text-lg opacity-50">/ mês</span>
              </div>
              <p className="text-xs text-muted-foreground">vs. benchmark do setor ({benchmarkConversao}%)</p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-red-500/10">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Sua CVR</p>
                <p className="text-lg font-black">{taxaConversaoAtual.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Benchmark setor</p>
                <p className="text-lg font-black text-emerald-500">{benchmarkConversao}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Perda/dia</p>
                <p className="text-lg font-black text-red-500">R$ {Math.round(perdaMensal / 30).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {diagnostic?.resumo && (
          <div className="bg-primary/5 border-l-4 border-primary rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Análise da IA</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{diagnostic.resumo}</p>
            {diagnostic.perda_principal && (
              <p className="text-xs text-muted-foreground">
                Gargalo principal: <strong className="text-white">{diagnostic.perda_principal}</strong>
                {diagnostic.percentual_explicado && (
                  <Badge className="ml-2 bg-primary/20 text-primary border-none text-[9px]">
                    {diagnostic.percentual_explicado}% das perdas explicadas
                  </Badge>
                )}
              </p>
            )}
          </div>
        )}

        {/* Problems */}
        {problemas.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" /> Problemas prioritários
            </h2>
            <div className="space-y-4">
              {problemas.map((p, i) => {
                const locked = !isActive && i >= 1;
                const card = (
                  <div className={cn(
                    "border rounded-2xl p-6 transition-all",
                    p.severidade === "critico"
                      ? "border-red-500/30 bg-red-500/5"
                      : p.severidade === "alto"
                      ? "border-orange-500/30 bg-orange-500/5"
                      : "border-yellow-500/30 bg-yellow-500/5"
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className={cn("text-[10px] font-bold tracking-widest px-2 py-0.5",
                        p.severidade === "critico" ? "text-red-500 border-red-500/50" :
                        p.severidade === "alto" ? "text-orange-500 border-orange-500/50" :
                        "text-yellow-500 border-yellow-500/50"
                      )}>
                        {p.severidade === "critico" ? "CRÍTICO" : p.severidade === "alto" ? "ALTO" : "MÉDIO"}
                      </Badge>
                      <span className="text-sm font-bold text-red-500">R$ {p.impacto_reais?.toLocaleString("pt-BR")}/mês</span>
                    </div>
                    <h3 className="text-lg font-bold mb-2">{p.titulo}</h3>
                    <p className="text-sm text-muted-foreground">{p.descricao}</p>
                  </div>
                );

                if (!locked) return <div key={i}>{card}</div>;

                return (
                  <div key={i} className="relative" aria-hidden="true">
                    <div className="filter blur-[6px] opacity-60 pointer-events-none select-none">
                      {card}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A0F]/70 to-[#0A0A0F]/90 rounded-2xl pointer-events-none" />
                  </div>
                );
              })}

              {!isActive && problemas.length > 1 && (() => {
                const lockedCount = problemas.length - 1;
                const lockedImpact = problemas.slice(1).reduce((sum, p) => sum + (p.impacto_reais ?? 0), 0);
                return (
                  <div className="relative -mt-48 z-10 border border-emerald-500/30 bg-[#0F1614]/95 backdrop-blur-xl rounded-2xl p-6 md:p-8 text-center space-y-4 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                      <Lock className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg md:text-xl font-black font-syne tracking-tighter">
                        Veja os outros {lockedCount} gargalos identificados
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        +R$ {lockedImpact.toLocaleString("pt-BR")}/mês em receita perdida bloqueados nestes itens
                      </p>
                    </div>
                    <Button
                      onClick={() => document.getElementById("planos-inline")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase text-xs px-6 h-11 border-0 shadow-lg shadow-emerald-900/30"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" /> Desbloquear diagnóstico completo
                    </Button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recomendacoes.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" /> Plano de ação
            </h2>
            <div className="space-y-4">
              {recomendacoes.map((r, i) => (
                <div key={i} className="border border-[#1E1E2E] bg-[#13131A] rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black",
                      r.tipo === "quick_win" ? "bg-emerald-500/20 text-emerald-500" :
                      r.tipo === "ab_test" ? "bg-blue-500/20 text-blue-500" :
                      "bg-amber-500/20 text-amber-500"
                    )}>
                      #{i + 1}
                    </div>
                    <Badge className={cn("text-[9px] font-black uppercase border-none",
                      r.tipo === "quick_win" ? "bg-emerald-500/20 text-emerald-500" :
                      r.tipo === "ab_test" ? "bg-blue-500/20 text-blue-500" :
                      "bg-amber-500/20 text-amber-500"
                    )}>
                      {r.tipo === "quick_win" ? "⚡ Quick Win" : r.tipo === "ab_test" ? "🧪 Teste A/B" : "📅 Médio Prazo"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {r.esforco === "baixo" ? "Esforço baixo" : r.esforco === "medio" ? "Esforço médio" : "Esforço alto"}
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold mb-2">{r.titulo}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{r.descricao}</p>
                  <div className="flex gap-6 text-xs">
                    <span className="text-emerald-500 font-bold">+{r.impacto_pp}pp de conversão</span>
                    <span className="text-muted-foreground">{r.prazo_semanas} semana{r.prazo_semanas > 1 ? "s" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Inline checkout — 3 plans, monthly/annual toggle, recommended highlighted */}
        {!isActive && diagnostic && (
          <div id="planos-inline" className="space-y-8 scroll-mt-20">
            <div className="text-center space-y-3">
              <Badge className="bg-primary/20 text-primary border-none text-[10px] font-black tracking-widest uppercase">
                Recomendamos {recommendedPlan.name} para sua loja
              </Badge>
              <h2 className="text-3xl md:text-4xl font-black font-syne tracking-tighter">
                Escolha seu plano e comece agora
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                {recommendation.reason}
              </p>

              <p className="text-[11px] text-white/50 mt-3 max-w-md mx-auto">
                Mensalidade fixa + Success Fee variável <span className="text-emerald-500 font-semibold">só sobre o que recuperarmos</span>
              </p>

              {/* Billing toggle */}
              <div className="inline-flex items-center gap-1 bg-[#13131A] border border-[#1E1E2E] rounded-full p-1 mt-4">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-full transition-all",
                    billingCycle === "monthly" ? "bg-white text-black" : "text-muted-foreground hover:text-white"
                  )}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setBillingCycle("annual")}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5",
                    billingCycle === "annual" ? "bg-white text-black" : "text-muted-foreground hover:text-white"
                  )}
                >
                  Anual
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.5 rounded-full",
                    billingCycle === "annual" ? "bg-emerald-500/20 text-emerald-700" : "bg-emerald-500/20 text-emerald-500"
                  )}>
                    -20%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["starter", "growth", "scale"] as const).map((key) => {
                const plan = PLANS[key];
                const isRecommended = recommendation.tier === key;
                const monthlyPrice = billingCycle === "annual"
                  ? Math.round(plan.base * 0.8)
                  : plan.base;
                const isLoading = checkoutLoading === key;

                return (
                  <div
                    key={key}
                    className={cn(
                      "relative border rounded-2xl p-6 flex flex-col gap-5 transition-all",
                      isRecommended
                        ? "border-emerald-500/50 bg-emerald-500/5 ring-2 ring-emerald-500/30 md:scale-[1.02]"
                        : "border-[#1E1E2E] bg-[#13131A]"
                    )}
                  >
                    {isRecommended && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black border-none text-[10px] font-black tracking-widest uppercase shadow-lg shadow-emerald-500/30">
                        ⭐ Recomendado para você
                      </Badge>
                    )}

                    <div className="space-y-1">
                      <div className="text-2xl">{plan.emoji}</div>
                      <h3 className="text-xl font-black font-syne">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.audience}</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black font-jetbrains">
                          R$ {monthlyPrice.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-xs text-muted-foreground">/mês</span>
                      </div>
                      {billingCycle === "annual" && (
                        <p className="text-[10px] text-emerald-500 font-bold">
                          economize R$ {((plan.base - monthlyPrice) * 12).toLocaleString("pt-BR")}/ano
                        </p>
                      )}
                      {(() => {
                        const rate = plan.successFeeRate;
                        const ratePct = (rate * 100).toFixed(rate < 0.02 ? 1 : 0);
                        const starterRate = PLANS.starter.successFeeRate;
                        const diffPp = ((starterRate - rate) * 100).toFixed(starterRate - rate < 0.02 ? 1 : 0);
                        const showSavings = key !== "starter";
                        return (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/55 cursor-help">
                                  <Percent className="w-3 h-3 text-emerald-500 shrink-0" />
                                  <span>
                                    + <span className="text-white/80 font-semibold">{ratePct}%</span> sobre receita recuperada
                                    <span className="text-white/40"> · Success Fee</span>
                                  </span>
                                  {showSavings && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                                      -{diffPp}pp vs Starter
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                                Você só paga essa taxa sobre o faturamento que o LTV Boost recupera. Sem recuperação, sem fee.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>

                    <ul className="space-y-2 text-xs flex-1">
                      {plan.landingFeatures.slice(0, 5).map((f: string) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", isRecommended ? "text-emerald-500" : "text-white/60")} />
                          <span className="text-white/80">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handleSubscribe(key)}
                      disabled={!!checkoutLoading}
                      size="lg"
                      className={cn(
                        "w-full h-12 text-sm font-black rounded-xl gap-2 group",
                        isRecommended
                          ? "bg-gradient-to-r from-emerald-500 to-blue-600 shadow-lg shadow-emerald-500/20 hover:scale-[1.01] transition-all"
                          : "bg-white text-black hover:bg-white/90"
                      )}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Abrindo checkout...
                        </>
                      ) : (
                        <>
                          Assinar {plan.name}
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Active user — invite to dashboard instead of upsell */}
        {isActive && diagnostic && (
          <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-3xl p-8 space-y-4 text-center">
            <Badge className="bg-emerald-500/20 text-emerald-500 border-none text-[10px] font-black tracking-widest uppercase">
              Plano ativo
            </Badge>
            <h2 className="text-2xl font-black font-syne tracking-tighter">
              Seu painel já está liberado
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Use o diagnóstico como guia: cada problema acima vira uma campanha pronta no painel.
            </p>
            <Button
              onClick={() => navigate("/dashboard")}
              size="lg"
              className="font-black rounded-xl gap-2"
            >
              Ir para o painel <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
