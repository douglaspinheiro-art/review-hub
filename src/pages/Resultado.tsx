import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, TrendingUp, AlertCircle, Loader2, Sparkles, ArrowRight, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [chs, setChs] = useState(0);
  const [chsLabel, setChsLabel] = useState("Regular");
  const [storeName, setStoreName] = useState("Sua Loja");
  const [persistedPlan, setPersistedPlan] = useState<"growth" | "scale" | null>(null);

  useEffect(() => {
    async function fetchDiagnostic() {
      if (!user?.id) return;

      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if ((storeData as { name?: string } | null)?.name) {
        setStoreName((storeData as { name: string }).name);
      }

      const { data: diagData } = await supabase
        .from("diagnostics_v3")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!diagData) {
        navigate("/diagnostico", { replace: true });
        return;
      }

      setDiagnostic(diagData.diagnostic_json as DiagnosticData);
      setChs(diagData.chs ?? 47);
      setChsLabel(diagData.chs_label ?? "Regular");
      const rp = (diagData as { recommended_plan?: string | null }).recommended_plan;
      if (rp === "growth" || rp === "scale") setPersistedPlan(rp);
      setLoading(false);
      void trackFunnelEvent({
        event: "diagnostic_viewed",
        metadata: { has_diagnostic: true, chs: diagData?.chs ?? null },
      });
    }

    fetchDiagnostic();
  }, [user?.id]);

  // Compute loss from funnel data
  const rawFunnel = sessionStorage.getItem("ltv_funnel_data");
  const funnel = rawFunnel ? JSON.parse(rawFunnel) : null;
  const ticketMedio = funnel?.ticket_medio || 250;
  const metaConversao = funnel?.meta_conversao || 2.5;
  const visitantesNum = funnel?.visitantes || 12400;
  const pedidosNum = funnel?.pedido || 174;
  const conversaoAtual = visitantesNum > 0 ? (pedidosNum / visitantesNum) * 100 : 1.4;
  const perdaMensal = Math.max(
    0,
    Math.round(((metaConversao / 100) - (conversaoAtual / 100)) * visitantesNum * ticketMedio),
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

  const handleActivate = () => {
    void trackFunnelEvent({
      event: "checkout_started",
      recommendedPlan: recommendation.tier,
      selectedPlan: recommendation.tier,
      metadata: { source: "resultado", chs, perdaMensal },
    });
    navigate(`/planos?recommended=${recommendation.tier}&from=diagnostico`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
            <Button size="sm" onClick={handleActivate} className="font-bold rounded-xl h-9 gap-1">
              Ativar plano {recommendedPlan.name} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-12 space-y-16">
        {/* CHS Block */}
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black font-syne tracking-tighter uppercase italic">
              Diagnóstico: {storeName}
            </h1>
            <p className="text-muted-foreground text-sm">
              Baseado em {visitantesNum.toLocaleString("pt-BR")} visitantes · {pedidosNum} pedidos · Conversão {conversaoAtual.toFixed(2)}%
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
              <p className="text-xs text-muted-foreground">vs. benchmark do setor ({metaConversao}%)</p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-red-500/10">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Sua CVR</p>
                <p className="text-lg font-black">{conversaoAtual.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Benchmark</p>
                <p className="text-lg font-black text-emerald-500">{metaConversao}%</p>
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
              {problemas.map((p, i) => (
                <div key={i} className={cn(
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
              ))}
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


        {/* Plan recommendation block — hidden when user already has an active plan */}
        {!isActive && diagnostic && (
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/30 rounded-3xl p-8 space-y-6">
            <div className="space-y-2">
              <Badge className="bg-primary/20 text-primary border-none text-[10px] font-black tracking-widest uppercase">
                Plano recomendado para sua loja
              </Badge>
              <h2 className="text-3xl font-black font-syne tracking-tighter">
                {recommendedPlan.emoji} {recommendedPlan.name}
                <span className="text-muted-foreground text-base font-bold ml-2">
                  · R$ {recommendedPlan.base.toLocaleString("pt-BR")}/mês
                </span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Com o seu CHS em <strong className="text-white">{chs}</strong>
                {perdaMensal > 0 && (
                  <> e perda estimada de <strong className="text-red-400">R$ {perdaMensal.toLocaleString("pt-BR")}/mês</strong></>
                )}
                , {recommendation.reason}
              </p>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {recommendedPlan.landingFeatures.slice(0, 6).map((f: string) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-white/80">{f}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={handleActivate}
              size="lg"
              className="w-full h-14 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-[1.01] transition-all gap-2 group"
            >
              Ativar plano {recommendedPlan.name} agora
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              🛡️ Garantia de 14 dias · Cancele quando quiser
            </p>
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

        {/* Secondary CTA: see all plans */}
        <div className="text-center">
          <button
            onClick={() => navigate("/planos?from=diagnostico")}
            className="text-xs text-muted-foreground hover:text-white underline-offset-4 hover:underline"
          >
            Comparar todos os planos
          </button>
        </div>
      </div>
    </div>
  );
}
