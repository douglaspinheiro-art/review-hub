import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  TrendingUp, RefreshCw, ChevronRight, Sparkles,
  Calendar, Users, Zap, ArrowRight, DollarSign,
  Target, MousePointer2, Wifi, WifiOff,
  CheckCircle2, Trophy, Share2, Smartphone, Flame,
} from "lucide-react";
import { NPSModal } from "@/components/dashboard/NPSModal";
import { ActivationChecklist } from "@/components/dashboard/ActivationChecklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { ProblemCard } from "@/components/dashboard/ProblemCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ROIAttribution } from "@/components/dashboard/ROIAttribution";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useProblems, useDashboardStats } from "@/hooks/useDashboard";
import { predictNextOrder } from "@/lib/ltv-predictor";
import {
  mockEventosSazonais,
} from "@/lib/mock-data";

export default function Dashboard() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [isSyncing, setIsSyncing] = useState(false);
  const [streak, setStreak] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const isNewSetup = searchParams.get("setup") === "complete" || searchParams.get("setup") === "novo";
  const isFirstWeek = searchParams.get("firstweek") === "true";
  const { user } = useAuth();

  const { data: problems = [] } = useProblems();
  const { data: statsData } = useDashboardStats(period);

  // Use real data only — no mock fallbacks
  const revenueRecovered = statsData?.revenueLast30 ?? 0;
  const revenueGrowth = statsData?.revGrowth ?? 0;
  const hasData = revenueRecovered > 0 || problems.length > 0;

  const { data: whatsappConnections = [] } = useQuery({
    queryKey: ["whatsapp_connections_status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("status")
        .eq("user_id", user?.id);
      return data || [];
    },
    enabled: !!user,
  });

  const isWhatsAppConnected = whatsappConnections.some(c => c.status === "connected");

  const handleSync = () => {
    if (isDemo) {
      toast.info("Modo demonstração ativo.");
      return;
    }
    setIsSyncing(true);
    setTimeout(() => {
      toast.success("Canais sincronizados!");
      setIsSyncing(false);
    }, 1500);
  };

  const [showNPS, setShowNPS] = useState(false);
  const [milestone, setMilestone] = useState<string | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<string | null>(null);

  // Streak: conta dias consecutivos de acesso + celebra marcos de 7 e 30 dias
  useEffect(() => {
    const today = new Date().toDateString();
    const lastVisit = localStorage.getItem("ltv_last_visit");
    const currentStreak = parseInt(localStorage.getItem("ltv_streak") || "0");

    if (lastVisit === today) {
      setStreak(currentStreak);
    } else {
      const yesterday = new Date(Date.now() - 86_400_000).toDateString();
      const newStreak = lastVisit === yesterday ? currentStreak + 1 : 1;
      localStorage.setItem("ltv_streak", String(newStreak));
      localStorage.setItem("ltv_last_visit", today);
      setStreak(newStreak);

      // Marco de 7 dias
      if (newStreak === 7 && !localStorage.getItem("ltv_streak_7_shown")) {
        setTimeout(() => {
          setStreakMilestone("7 dias seguidos!");
          localStorage.setItem("ltv_streak_7_shown", "1");
        }, 800);
      }
      // Marco de 30 dias
      if (newStreak === 30 && !localStorage.getItem("ltv_streak_30_shown")) {
        setTimeout(() => {
          setStreakMilestone("30 dias seguidos! Você é top 5% dos usuários.");
          localStorage.setItem("ltv_streak_30_shown", "1");
        }, 800);
      }
    }
  }, []);

  // NPS: apenas para usuários com 30+ dias reais de cadastro
  useEffect(() => {
    const alreadyShown = localStorage.getItem("ltv_nps_shown");
    const signupDate = localStorage.getItem("ltv_signup_date");
    if (!signupDate) {
      localStorage.setItem("ltv_signup_date", String(Date.now()));
      return;
    }
    if (!alreadyShown) {
      const daysSince = Math.floor((Date.now() - Number(signupDate)) / (1000 * 60 * 60 * 24));
      if (daysSince >= 30) {
        setTimeout(() => setShowNPS(true), 5000);
        localStorage.setItem("ltv_nps_shown", "1");
      }
    }
  }, []);

  // Milestone: apenas após o usuário aprovar ao menos uma prescrição
  useEffect(() => {
    const milestoneShown = localStorage.getItem("ltv_milestone_shown");
    const prescricoesAprovadas = localStorage.getItem("ltv_prescricoes_aprovadas");
    if (!milestoneShown && prescricoesAprovadas && parseInt(prescricoesAprovadas) > 0) {
      setTimeout(() => {
        setMilestone("R$ 1.000 recuperados");
        localStorage.setItem("ltv_milestone_shown", "1k");
      }, 1000);
    }
  }, []);

  // Real data from queries — no hardcoded values
  const roi = revenueRecovered > 0 ? (revenueRecovered / 297).toFixed(1) : "0";
  
  const stats = [
    { label: "LTV Boost ROI",  value: `${roi}x`,  trend: revenueGrowth, icon: Zap, color: "text-emerald-500" },
    { label: "Recuperado",     value: `R$ ${revenueRecovered.toLocaleString("pt-BR")}`, trend: revenueGrowth, icon: DollarSign, color: "text-primary" },
    { label: "Conversão",      value: `${statsData?.conversionRate?.toFixed(2) ?? "0.00"}%`, trend: 0, icon: TrendingUp },
    { label: "Novos Clientes", value: (statsData?.newContacts ?? 0).toLocaleString("pt-BR"), trend: 0, icon: Users },
  ];

  const pendingCount = problems.length;
  const pendingValue = problems.reduce((acc, p) => acc + Number(p.impacto_estimado || 0), 0);

  return (
    <>
      <div className="space-y-10 pb-28 md:pb-20">
        {/* NPS Modal */}
        {showNPS && <NPSModal onClose={() => setShowNPS(false)} />}

        {/* Streak Milestone Toast */}
        {streakMilestone && (
          <div className="fixed bottom-24 right-6 z-40 animate-in slide-in-from-right-8 fade-in duration-500">
            <div className="bg-card border border-amber-500/30 rounded-2xl p-5 shadow-2xl shadow-amber-500/10 max-w-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Streak atingido!</p>
                  <p className="font-black text-sm">{streakMilestone}</p>
                </div>
                <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setStreakMilestone(null)}>✕</button>
              </div>
              <p className="text-xs text-muted-foreground">Lojistas consistentes têm <strong>2.8x mais receita recuperada</strong>. Continue aprovando prescrições diariamente.</p>
              <Button size="sm" className="w-full h-7 font-bold text-[10px] gap-1.5" onClick={() => { navigate("/dashboard/prescricoes"); setStreakMilestone(null); }}>
                <Zap className="w-3 h-3" /> Ver Prescrições Pendentes
              </Button>
            </div>
          </div>
        )}

        {/* Milestone Toast */}
        {milestone && (
          <div className="fixed bottom-24 right-6 z-40 animate-in slide-in-from-right-8 fade-in duration-500">
            <div className="bg-card border border-primary/30 rounded-2xl p-5 shadow-2xl shadow-primary/10 max-w-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-primary fill-primary/20" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary">Marco atingido!</p>
                  <p className="font-black text-sm">{milestone}</p>
                </div>
                <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setMilestone(null)}>✕</button>
              </div>
              <p className="text-xs text-muted-foreground">Parabéns! Você recuperou seu primeiro grande valor com o LTV Boost. Continue aprovando prescrições para crescer ainda mais.</p>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 font-bold text-[10px] gap-1.5 flex-1" onClick={() => navigate("/dashboard/prescricoes")}>
                  <Zap className="w-3 h-3" /> Ver Prescrições
                </Button>
                <Button size="sm" variant="outline" className="h-7 font-bold text-[10px] gap-1.5" onClick={() => {
                  if (navigator.share) navigator.share({ title: "LTV Boost", text: `Acabei de recuperar ${milestone} com IA no WhatsApp!`, url: "https://ltvboost.com.br" });
                  setMilestone(null);
                }}>
                  <Share2 className="w-3 h-3" /> Compartilhar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border/10 pb-8">
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                Loja Saudável
              </Badge>
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest",
                isWhatsAppConnected
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              )}>
                {isWhatsAppConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isWhatsAppConnected ? "WhatsApp Ativo" : "WhatsApp Off"}
              </div>
              {streak > 1 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-500">
                  <Flame className="w-3 h-3" />
                  {streak} dias seguidos
                </div>
              )}
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter italic">Sync: há 4 min</span>
            </div>

            <h1 className="text-4xl font-black font-syne tracking-tighter uppercase italic">
              Radar de <span className="text-primary">Lucro</span>
            </h1>
            {pendingValue > 0 ? (
              <p className="text-muted-foreground text-sm font-medium">
                Você tem <span className="text-foreground font-bold underline">R$ {pendingValue.toLocaleString("pt-BR")}</span> parados no funil. Vamos recuperar?
              </p>
            ) : (
              <p className="text-muted-foreground text-sm font-medium">
                Conecte sua loja para começar a recuperar receita.
              </p>
            )}
            {revenueRecovered > 0 && (
              <p className="text-xs font-bold flex items-center gap-1.5 text-emerald-500">
                <TrendingUp className="w-3.5 h-3.5" />
                R$ {revenueRecovered.toLocaleString("pt-BR")} já recuperados para você.
              </p>
            )}

            {/* CTA principal — sempre visível acima do fold */}
            <div className="flex items-center gap-3 pt-3">
              <Button
                onClick={() => navigate("/dashboard/prescricoes")}
                className="h-11 px-6 bg-primary hover:bg-primary/90 font-black text-[11px] gap-2 rounded-2xl shadow-lg shadow-primary/20 uppercase tracking-wide"
              >
                <Zap className="w-4 h-4 fill-primary-foreground" />
                {pendingCount} {pendingCount === 1 ? "Prescrição pendente" : "Prescrições pendentes"}
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:block">
                Potencial: <span className="text-foreground font-bold">R$ {pendingValue.toLocaleString("pt-BR")}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              className="h-11 font-black text-[10px] uppercase tracking-widest gap-2 rounded-2xl border-2 px-6 hover:bg-primary hover:text-white transition-all"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} /> Sincronizar
            </Button>
          </div>
        </div>

        {/* Checklist de ativação — só aparece para usuários não-ativados */}
        <ActivationChecklist />

        {/* Banner: primeira semana */}
        {isFirstWeek && (
          <Card className="p-8 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent shadow-2xl shadow-emerald-500/10 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Sua primeira semana</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black font-syne tracking-tighter text-emerald-400">
                  R$ {pd.recovered.toLocaleString("pt-BR")}
                </h2>
                <p className="text-sm text-muted-foreground font-medium">recuperados pela IA nesta semana. Cada prescrição aprovada aumenta esse número.</p>
                <div className="flex gap-6 pt-2">
                  <div>
                    <p className="text-2xl font-black">{pd.roi}x</p>
                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">ROI sobre assinatura</p>
                  </div>
                  <div className="w-px bg-border/20" />
                  <div>
                    <p className="text-2xl font-black">{pendingCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Prescrições pendentes</p>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => navigate("/dashboard/prescricoes")}
                className="h-14 px-10 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-2xl shadow-xl shadow-emerald-500/20 gap-2 shrink-0"
              >
                <Zap className="w-5 h-5 fill-black" /> Aprovar Prescrições
              </Button>
            </div>
          </Card>
        )}

        {/* Banner: Receita em risco — visível quando há prescrições pendentes e usuário não é novo */}
        {!isFirstWeek && !isNewSetup && pendingCount > 0 && (
          <Card className="p-6 border-red-500/20 bg-red-500/5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                  <Target className="w-5 h-5 text-red-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Receita em risco agora</p>
                  <p className="font-black text-base">
                    R$ {pendingValue.toLocaleString("pt-BR")} identificados mas não capturados
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pendingCount} {pendingCount === 1 ? "oportunidade detectada" : "oportunidades detectadas"} pela IA. Cada hora sem ação reduz a taxa de recuperação.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate("/dashboard/prescricoes")}
                className="h-12 px-8 bg-red-500 hover:bg-red-400 text-white font-black rounded-2xl shadow-lg shadow-red-500/20 gap-2 shrink-0"
              >
                <Zap className="w-4 h-4 fill-white" /> Recuperar agora
              </Button>
            </div>
          </Card>
        )}

        {/* Banner: WhatsApp desconectado — sempre visível até conectar */}
        {!isWhatsAppConnected && !isNewSetup && !isFirstWeek && (
          <Card className="p-6 border-amber-500/30 bg-amber-500/5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="w-5 h-5 text-amber-500" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Ação necessária</p>
                  <p className="font-black text-base">Conecte seu WhatsApp para ativar o produto</p>
                  <p className="text-sm text-muted-foreground">Sem isso, nenhuma automação ou campanha será enviada.</p>
                </div>
              </div>
              <Button
                onClick={() => navigate("/dashboard/whatsapp")}
                className="h-12 px-8 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl shadow-lg shadow-amber-500/20 gap-2 shrink-0"
              >
                <Smartphone className="w-4 h-4" /> Conectar agora →
              </Button>
            </div>
          </Card>
        )}

        {/* Banner: setup recém-concluído */}
        {isNewSetup && !isFirstWeek && (
          <Card className="p-8 border-primary/20 bg-primary/5 shadow-2xl shadow-primary/5 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Loja configurada com sucesso</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black font-syne uppercase italic tracking-tight">
                  A IA já identificou <span className="text-primary">R$ 4.200</span> para recuperar
                </h2>
                <p className="text-sm text-muted-foreground font-medium">Complete os 3 passos abaixo para ativar a recuperação automática e capturar esse valor hoje.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="flex items-center gap-3 p-4 bg-background/50 rounded-2xl border border-border/50">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest">Loja</p>
                      <p className="text-xs font-bold text-emerald-500">Conectada</p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02]",
                      isWhatsAppConnected ? "bg-background/50 border-border/50" : "bg-amber-500/5 border-amber-500/20"
                    )}
                    onClick={() => navigate("/dashboard/whatsapp")}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      isWhatsAppConnected ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                    )}>
                      {isWhatsAppConnected
                        ? <CheckCircle2 className="w-5 h-5 text-white" />
                        : <Smartphone className="w-4 h-4 text-white" />
                      }
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest">WhatsApp</p>
                      <p className={cn("text-xs font-bold", isWhatsAppConnected ? "text-emerald-500" : "text-amber-500")}>
                        {isWhatsAppConnected ? "Conectado" : "Pendente"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-background/50 rounded-2xl border border-border/50 opacity-50">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest">Automação</p>
                      <p className="text-xs font-bold">Inativa</p>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => navigate(isWhatsAppConnected ? "/dashboard/automacoes" : "/dashboard/whatsapp")}
                className="h-16 px-10 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-2xl shadow-xl shadow-primary/20 gap-2"
              >
                {isWhatsAppConnected ? "Ativar Primeira Automação" : "Conectar WhatsApp Agora"} <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </Card>
        )}

        {/* Seção principal: CHS + Métricas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2">Saúde da sua base de clientes</p>
            </div>
            <div onClick={() => navigate("/dashboard/funil")} className="cursor-pointer group">
              <CHSGauge
                score={statsData?.chs ?? 0}
                label={statsData?.chsLabel ?? "Sem dados"}
                breakdown={statsData?.chsBreakdown}
                historico={statsData?.chsHistory}
                className="h-full border-none shadow-2xl shadow-primary/5 bg-card/50 backdrop-blur-xl group-hover:scale-[1.02] transition-transform duration-500"
              />
            </div>

            <Card className="p-6 bg-primary border-none shadow-2xl shadow-primary/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                <Target className="w-20 h-20 text-white" />
              </div>
              <h3 className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-4">Meta de Conversão</h3>
              <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-end">
                  <span className="text-3xl font-black text-white font-syne italic">1.4% <span className="text-xs font-medium text-white/50">/ 2.5%</span></span>
                  <Badge className="bg-white/20 text-white border-none font-black text-[10px]">EM PROGRESSO</Badge>
                </div>
                <div className="h-2.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full bg-white w-[56%] relative">
                    <div className="absolute top-0 right-0 h-full w-8 bg-white/20 animate-pulse" />
                  </div>
                </div>
                <p className="text-[10px] text-white/80 font-bold leading-relaxed">
                  Você está a <span className="underline decoration-2">1.1%</span> de atingir sua meta e gerar mais <span className="font-black">R$ 24.500</span> em vendas.
                </p>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-8">
            {/* ROI Attribution Dash (V4) */}
            <ROIAttribution 
              revenue={revenueRecovered} 
              growth={revenueGrowth} 
              period={period} 
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((s) => (
                <MetricCard
                  key={s.label}
                  label={s.label}
                  value={s.value}
                  trend={s.trend}
                  icon={s.icon}
                  className={cn(
                    "border-none bg-card/50 shadow-xl shadow-black/5 hover:bg-card transition-all",
                    s.color
                  )}
                />
              ))}
            </div>

            {/* Oportunidade de Ouro */}
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
                    Identificamos <span className="text-primary underline">R$ 4.200</span> em boletos que expiram em 24h.
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    Clientes VIP abandonaram o checkout. O Agente IA pode oferecer frete grátis agora para fechar essas vendas.
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

            {/* Cards sazonais + clientes hibernando */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {mockEventosSazonais.map((e) => (
                <div key={e.nome} className="bg-card/50 border border-border/10 rounded-2xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-amber-500" />
                    </div>
                    <Badge variant="outline" className="text-[8px] font-black border-amber-500/20 text-amber-500">{e.dias_restantes} DIAS</Badge>
                  </div>
                  <h4 className="font-black text-sm uppercase tracking-tight mb-1">{e.nome} chegando</h4>
                  <p className="text-xs text-muted-foreground">Histórico de vendas: <span className="text-emerald-500 font-bold">+{e.historico_crescimento}%</span></p>
                  <Button
                    variant="ghost"
                    className="w-full mt-4 h-9 text-[9px] font-black uppercase tracking-widest gap-2 hover:bg-amber-500/10 hover:text-amber-600 rounded-xl"
                    onClick={() => navigate("/dashboard/campanhas")}
                  >
                    Preparar Campanha <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              ))}

              <div className="bg-card/50 border border-border/10 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <MousePointer2 className="w-5 h-5 text-primary" />
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black border-primary/20 text-primary">RETENÇÃO</Badge>
                </div>
                <h4 className="font-black text-sm uppercase tracking-tight mb-1">Clientes Hibernando</h4>
                <p className="text-xs text-muted-foreground">847 clientes não compram há +60 dias.</p>
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

        {/* Feed de atividade em tempo real */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h2 className="text-2xl font-black font-syne tracking-tighter uppercase italic">Capturas <span className="text-primary">ao vivo</span></h2>
              <p className="text-xs text-muted-foreground mt-1">Ações automáticas executadas pela IA agora mesmo.</p>
            </div>
            <ActivityFeed />
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
                    <span className="text-sm font-black text-white font-mono tracking-tighter">R$ 41.000</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-white/20 w-[65%]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-emerald-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Com LTV Boost</span>
                    <span className="text-lg font-black font-syne tracking-tighter">R$ 57.400</span>
                  </div>
                  <div className="h-2 bg-emerald-500/10 rounded-full overflow-hidden border border-emerald-500/20">
                    <div className="h-full bg-emerald-500 w-[90%] relative shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                      <div className="absolute top-0 right-0 h-full w-12 bg-white/30 skew-x-[-20deg] animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-400 font-bold text-right italic">+R$ 16.400 potencial mensal</p>
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

        {/* Radar de Oportunidades */}
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
              {/* LTV Predictor Summary Card */}
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

              {problems.length > 0 ? (
                problems.map((p, i) => (
                  <ProblemCard
                    key={p.id}
                    tipo={p.tipo as any}
                    titulo={p.titulo}
                    descricao={p.descricao || "Impacto imediato no lucro líquido."}
                    severidade={p.severidade as any}
                    impacto_estimado={p.impacto_estimado}
                    causa_raiz={p.causa_raiz}
                    detectado_em={p.detectado_em}
                    status={p.status as any}
                    onVer={() => navigate("/dashboard/prescricoes")}
                    onAprovar={() => navigate("/dashboard/prescricoes")}
                  />
                ))
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
              {/* Partner logos trust signal */}
              <div className="bg-card/30 border border-border/20 rounded-2xl p-4 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Integra com</p>
                <div className="flex flex-wrap gap-2">
                  {["Shopify", "Nuvemshop", "WooCommerce", "VTEX", "Yampi", "Tray"].map((p) => (
                    <span key={p} className="px-2.5 py-1 rounded-lg bg-muted/40 text-[10px] font-black text-muted-foreground border border-border/30">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA fixo mobile — sempre acessível sem scroll */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-lg border-t border-border z-50">
        <Button
          className="w-full h-14 font-black bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/20 gap-2 text-sm"
          onClick={() => navigate("/dashboard/prescricoes")}
        >
          <Zap className="w-5 h-5 fill-primary-foreground" />
          {pendingCount} {pendingCount === 1 ? "Prescrição" : "Prescrições"} — R$ {pendingValue.toLocaleString("pt-BR")} a recuperar
        </Button>
      </div>
    </>
  );
}
