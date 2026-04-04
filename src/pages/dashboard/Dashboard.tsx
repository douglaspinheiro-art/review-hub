import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { 
  TrendingUp, ShoppingCart, RefreshCw, ChevronRight, Sparkles, 
  Calendar, Info, AlertCircle, ShoppingBag, Users, LayoutDashboard,
  Zap, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { ProblemCard } from "@/components/dashboard/ProblemCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { 
  mockLoja, mockMetricas, mockProblemas, mockPrescricoes, 
  mockEventosSazonais, mockCanais 
} from "@/lib/mock-data";

export default function Dashboard() {
  const [period, setPeriod] = useState(30);
  const [isSyncing, setIsSyncing] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";

  const handleSync = () => {
    if (isDemo) {
      toast.info("Você está no modo demonstração. Conecte sua loja real para sincronizar.");
      return;
    }
    setIsSyncing(true);
    toast.promise(new Promise(res => setTimeout(res, 2000)), {
      loading: "Sincronizando canais...",
      success: "Dados atualizados com sucesso!",
      error: "Erro ao sincronizar.",
    }).finally(() => setIsSyncing(false));
  };

  const handleAprovarPrescricao = (id: string) => {
    toast.success("Prescrição aprovada! Verificando frequência da base...");
    navigate(`/dashboard/prescricoes`);
  };

  // Stats from mock
  const stats = [
    { label: "Receita", value: `R$ ${(mockMetricas.receita || 0).toLocaleString('pt-BR')}`, trend: +12, icon: ShoppingBag, tooltip: "Faturamento bruto total no período." },
    { label: "Conversão", value: `${(((mockMetricas.pedido || 0) / (mockMetricas.visitantes || 1)) * 100).toFixed(2)}%`, trend: -2, icon: TrendingUp, tooltip: "Percentual de visitantes que finalizaram uma compra." },
    { label: "Clientes", value: (mockMetricas.visitantes || 0).toLocaleString('pt-BR'), trend: +5, icon: Users, tooltip: "Total de visitantes únicos identificados." },
    { label: "Carrinhos", value: (mockMetricas.carrinho || 0).toLocaleString('pt-BR'), trend: +8, icon: ShoppingCart, tooltip: "Produtos adicionados ao carrinho no período." },
  ];

  return (
    <div className="space-y-8 pb-10">
      {isDemo && (
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">Modo de Demonstração Ativado</p>
              <p className="text-xs text-muted-foreground">Explore o potencial do LTV Boost com dados fictícios.</p>
            </div>
          </div>
          <Button onClick={() => navigate('/onboarding')} className="bg-primary text-primary-foreground font-bold h-9 rounded-xl px-6">
            Conectar Loja Real
          </Button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter">Central de Inteligência</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-1">
            <span className="flex items-center gap-1">
              {mockCanais.map((c, i) => (
                <span key={c.tipo} className="flex items-center gap-1">
                  {i > 0 && " + "}
                  {c.tipo === 'loja_propria' ? 'Nuvemshop' : 'Mercado Livre'}
                </span>
              ))}
            </span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30 mx-1" />
            Sync: há 4 min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-muted p-1 rounded-xl flex">
            {['7d', '30d', '90d'].map((p) => (
              <Button
                key={p}
                variant={period === parseInt(p) ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs font-bold px-4 rounded-lg"
                onClick={() => setPeriod(parseInt(p))}
              >
                {p}
              </Button>
            ))}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-10 font-bold gap-2 rounded-xl"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} /> Sincronizar
          </Button>
        </div>
      </div>

      {/* Main CHS Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 cursor-pointer" onClick={() => navigate('/dashboard/funil')}>
          <CHSGauge 
            score={mockLoja.conversion_health_score} 
            label={mockLoja.chs_label}
            breakdown={mockLoja.chs_breakdown}
            className="h-full hover:border-primary/50 transition-all"
          />
        </div>
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <MetricCard 
                key={s.label}
                label={s.label}
                value={s.value}
                trend={s.trend}
                icon={s.icon}
                tooltip={s.tooltip}
                className="cursor-pointer hover:border-primary/30 transition-all"
              />
            ))}
          </div>

          {/* Quick Win Prescription */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 border-l-4 border-l-primary">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-primary fill-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-base">Recomendação do Dia</h4>
                  <Badge className="bg-primary text-primary-foreground text-[8px] font-black uppercase px-1.5 py-0.5">Quick Win</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Ative a <span className="text-foreground font-bold">Recuperação de Boleto VIP</span> para converter +R$ 4.200 hoje.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate('/dashboard/prescricoes')} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2 rounded-xl h-11 px-6 shadow-lg shadow-primary/20">
              Ativar agora <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Seasonal Alert */}
          {mockEventosSazonais.map((e) => (
            <div key={e.nome} className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-amber-500/10 transition-all" />
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Calendar className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base flex items-center gap-2">
                      📅 NO RADAR — {e.nome} em {e.dias_restantes} dias
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Histórico: <span className="text-emerald-500 font-bold">+{e.historico_crescimento}%</span> de vendas na sua loja vs. semana normal.
                    </p>
                  </div>
                </div>
                <Button 
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-2 rounded-xl h-11 px-6"
                  onClick={() => navigate('/dashboard/prescricoes')}
                >
                  Preparar prescrição sazonal <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Problem Feed Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold font-syne tracking-tight flex items-center gap-2">
            Feed de Problemas <Badge variant="secondary" className="bg-primary/10 text-primary border-0">{mockProblemas.length}</Badge>
          </h2>
          <Button variant="link" onClick={() => navigate('/dashboard/prescricoes')} className="text-primary font-bold text-sm h-auto p-0 gap-1">
            Ver todos <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {mockProblemas.map((p, i) => (
              <ProblemCard 
                key={i}
                tipo={p.tipo as any}
                titulo={p.titulo}
                descricao={p.descricao || "Impacto detectado no checkout."}
                severidade={p.severidade as any}
                impacto_estimado={p.impacto_estimado}
                causa_raiz={p.causa_raiz}
                detectado_em={p.detectado_em}
                status={p.status as any}
                onVer={() => p.tipo === 'produto' ? navigate('/dashboard/produtos') : navigate('/dashboard/funil')}
                onAprovar={() => handleAprovarPrescricao(i.toString())}
              />
            ))}
          </div>

          <div className="space-y-6">
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary fill-primary" /> Sugestões de Prescrição
              </h3>
              <div className="space-y-4">
                {mockPrescricoes.map((p) => (
                  <div 
                    key={p.id} 
                    onClick={() => navigate('/dashboard/prescricoes')}
                    className="border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge className="bg-primary/10 text-primary border-0 text-[10px] font-bold">
                        {p.canal.toUpperCase()}
                      </Badge>
                      <span className="text-emerald-500 font-bold text-xs">{p.roi_estimado}x ROI</span>
                    </div>
                    <h4 className="font-bold text-sm group-hover:text-primary transition-colors">{p.titulo}</h4>
                    <p className="text-xs text-muted-foreground mt-1">Alvo: {p.segmento.replace('_', ' ')} • {p.num_clientes} clientes</p>
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Potencial: <span className="text-foreground font-bold">R$ {(p.potencial_estimado || 0).toLocaleString('pt-BR')}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase tracking-tighter gap-1 hover:bg-primary hover:text-primary-foreground">
                        Aprovar <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6">
              <h3 className="font-bold text-base mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" /> Revenue Forecast
              </h3>
              <p className="text-xs text-muted-foreground mb-4">Projeção para os próximos 30 dias baseada em prescrições ativas.</p>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Cenário Atual</span>
                  <span className="text-xs font-bold font-syne">R$ 41.000</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-muted-foreground/30 w-[60%]" />
                </div>
                
                <div className="flex items-center justify-between text-emerald-500">
                  <span className="text-xs font-bold">Com Prescrições</span>
                  <span className="text-sm font-black font-syne">R$ 57.400</span>
                </div>
                <div className="h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[85%] relative">
                    <div className="absolute top-0 right-0 h-full w-8 bg-white/20 animate-pulse" />
                  </div>
                </div>
                <p className="text-[10px] text-emerald-500 font-bold text-right">+R$ 16.400 potencial identificado</p>
              </div>

              <Button 
                variant="outline" 
                className="w-full mt-6 border-indigo-500/30 hover:bg-indigo-500/10 font-bold text-xs h-10 rounded-xl"
                onClick={() => navigate('/dashboard/forecast')}
              >
                Ver relatório completo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
