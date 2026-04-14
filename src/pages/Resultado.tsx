// @ts-nocheck -- Supabase types.ts schema misalignment (read-only file)
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, Zap, TrendingUp,
  AlertCircle, Lock, Smartphone, Send, MessageCircle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { mockLoja, mockMetricas, mockProblemas } from "@/lib/mock-data";
import { toast } from "sonner";

export default function Resultado() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const perdaUrl = searchParams.get("perda");

  const [billingCycle, setBillingCycle] = useState<"mensal" | "anual">("mensal");
  const [isSendingTest, setIsSendingTest] = useState(false);

  const m = mockMetricas;
  const chs = mockLoja.conversion_health_score;
  const displayPerda = perdaUrl ? Number(perdaUrl) : m.perda_mensal;

  const handleSendTest = () => {
    setIsSendingTest(true);
    setTimeout(() => {
      setIsSendingTest(false);
      toast.success("Mensagem de teste enviada para seu WhatsApp!");
    }, 1500);
  };

  const handleActivate = () => {
    navigate("/dashboard");
    toast.success("Bem-vindo ao LTV Boost! Configure sua loja para começar.");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-20">
      {/* Top Header */}
      <div className="border-b border-[#1E1E2E] bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </div>
          <Button size="sm" onClick={handleActivate} className="font-bold rounded-xl h-9">
            Ativar minha conta
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-12 space-y-16">
        {/* BLOCO 1 — CHS */}
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black font-syne tracking-tighter uppercase italic">Diagnóstico de {mockLoja.nome}</h1>
            <p className="text-muted-foreground text-sm">Baseado em 262 pedidos · 1.247 clientes únicos · 2 canais</p>
          </div>

          <div className="flex justify-center">
            <CHSGauge 
              score={chs} 
              label={mockLoja.chs_label}
              breakdown={mockLoja.chs_breakdown}
              className="w-full max-w-sm border-0 bg-transparent"
            />
          </div>
        </div>

        {/* BLOCO 2 — A perda */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <AlertCircle className="w-16 h-16 text-red-500" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-widest text-red-500/80">Você está perdendo</p>
            <div className="text-5xl font-black font-jetbrains text-red-500 tracking-tighter">
              R$ {displayPerda.toLocaleString('pt-BR')} <span className="text-lg opacity-50">/ mês</span>
            </div>
            <p className="text-xs text-muted-foreground">vs. benchmark do seu segmento (2.8%)</p>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-red-500/10">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Sua CVR</p>
              <p className="text-lg font-black">{m.cvr_mobile.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Benchmark</p>
              <p className="text-lg font-black text-emerald-500">{m.benchmark_segmento}%</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Perda/dia</p>
              <p className="text-lg font-black text-red-500">R$ {Math.round(m.perda_mensal/30).toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </div>

        {/* BLOCO 5 — Problemas + Prescrições */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Problemas Prioritários
          </h2>
          
          <div className="space-y-4">
            {mockProblemas.map((p, i) => (
              <div key={i} className={cn(
                "border rounded-2xl overflow-hidden transition-all",
                i === 0 ? "border-red-500/30 bg-red-500/5" : "border-[#1E1E2E] bg-[#13131A] opacity-60 grayscale"
              )}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant="outline" className={cn("text-[10px] font-bold tracking-widest px-2 py-0.5", i === 0 ? "text-red-500 border-red-500/50" : "")}>
                      {i === 0 ? "CRÍTICO" : "BLOQUEADO"}
                    </Badge>
                    <span className="text-sm font-bold text-red-500">R$ {p.impacto_estimado.toLocaleString('pt-BR')}/mês</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{p.titulo}</h3>
                  <p className="text-sm text-muted-foreground mb-6">"{p.causa_raiz}"</p>
                  
                  {i === 0 ? (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                          <Zap className="w-3 h-3 text-primary fill-primary" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Prescrição Gerada</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="space-y-1">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold">Canal</span>
                          <p className="text-xs font-bold flex items-center gap-1.5"><Smartphone className="w-3 h-3" /> WhatsApp</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold">Segmento</span>
                          <p className="text-xs font-bold">Em Risco (847 clientes)</p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3 mb-4">
                        "Oi [Nome]! Frete grátis pra você hoje 🎁..."
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          onClick={handleSendTest}
                          disabled={isSendingTest}
                          variant="outline" 
                          className="flex-1 h-10 text-[10px] font-bold uppercase tracking-widest rounded-xl border-primary/30 hover:bg-primary/10"
                        >
                          {isSendingTest ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Send className="w-3 h-3 mr-2" />}
                          Enviar Teste
                        </Button>
                        <Button 
                          onClick={handleActivate}
                          className="flex-1 h-10 text-[10px] font-bold uppercase tracking-widest rounded-xl bg-primary text-primary-foreground"
                        >
                          Executar Ação
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 space-y-2">
                      <Lock className="w-5 h-5 text-muted-foreground" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Disponível no Plano Growth</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BLOCO 7 — Revenue Forecast */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="w-16 h-16 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold font-syne uppercase tracking-tighter mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" /> Previsão de Receita (30d)
          </h3>
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <div className="space-y-1 text-muted-foreground">
                <span className="text-xs font-bold uppercase">Cenário Atual</span>
                <p className="text-xl font-black font-syne">R$ 41.000</p>
              </div>
              <div className="text-right space-y-1 text-emerald-500">
                <span className="text-xs font-bold uppercase">Com Prescrições</span>
                <p className="text-3xl font-black font-syne">R$ 57.400</p>
              </div>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-muted-foreground/30 w-[65%]" />
              <div className="h-full bg-emerald-500 w-[35%] relative">
                <div className="absolute top-0 left-0 h-full w-full bg-white/20 animate-pulse" />
              </div>
            </div>
            <p className="text-xs text-center font-bold text-emerald-500 uppercase tracking-widest">
              Potencial de Crescimento: +R$ 16.400 identificados
            </p>
          </div>
        </div>

        {/* BLOCO 8 — Planos */}
        <div className="space-y-12 pt-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-black font-syne tracking-tighter uppercase italic">Escolha seu Plano</h2>
            <div className="flex items-center justify-center gap-4">
              <span className={cn("text-xs font-bold", billingCycle === 'mensal' ? "text-white" : "text-muted-foreground")}>Mensal</span>
              <button 
                onClick={() => setBillingCycle(billingCycle === 'mensal' ? 'anual' : 'mensal')}
                className="w-12 h-6 bg-[#1E1E2E] rounded-full relative p-1"
              >
                <div className={cn("w-4 h-4 bg-primary rounded-full transition-all", billingCycle === 'anual' ? "ml-6" : "ml-0")} />
              </button>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-bold", billingCycle === 'anual' ? "text-white" : "text-muted-foreground")}>Anual</span>
                <Badge className="bg-emerald-500 text-black border-0 text-[8px] font-black uppercase">2 meses grátis</Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-8 space-y-8">
              <div className="space-y-2">
                <h3 className="text-xl font-bold uppercase tracking-widest">Crescimento</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black">R$ 897</span>
                  <span className="text-muted-foreground text-sm font-bold">/mês</span>
                </div>
                <p className="text-[10px] text-muted-foreground">ou R$ 747/mês no plano anual</p>
              </div>
              <ul className="space-y-4">
                {["5.000 contatos", "10.000 msgs/mês", "3 WhatsApp", "Carrinho Abandonado", "Chatbot + IA", "Segmentação RFM"].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={handleActivate} className="w-full h-12 rounded-xl font-bold border-[#1E1E2E]">Começar grátis — 14 dias</Button>
            </div>

            <div className="bg-gradient-to-br from-[#1A1A2E] to-[#0A0A0F] border-2 border-primary rounded-3xl p-8 space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-black px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-xl">MAIS POPULAR</div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold uppercase tracking-widest text-primary italic">Escala</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-primary">R$ 1.997</span>
                  <span className="text-muted-foreground text-sm font-bold">/mês</span>
                </div>
                <p className="text-[10px] text-primary/60">ou R$ 1.664/mês no plano anual</p>
              </div>
              <ul className="space-y-4">
                {[
                  "10.000 contatos / 50K msgs",
                  "WhatsApp ilimitado",
                  "Prescrições + Automações IA",
                  "Benchmark Score exclusivo",
                  "Multi-canal (WA + SMS + Email)",
                  "API pública + White-label",
                  "Gerente de sucesso dedicado",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm font-bold">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-1 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Potencial identificado</p>
                <p className="text-2xl font-black text-primary">R$ 57.400/mês</p>
                <p className="text-[9px] text-muted-foreground font-bold">ROI Estimado: 82x</p>
              </div>
              <Button onClick={handleActivate} className="w-full h-14 rounded-xl font-black text-lg bg-gradient-to-r from-emerald-500 to-blue-600 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all">Ativar Escala — 14 dias grátis</Button>
            </div>
          </div>
        </div>

        {/* Comunidade */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-3xl p-8 text-center space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em]">
              <Users className="w-3 h-3" /> Comunidade exclusiva
            </div>
            <h3 className="text-2xl font-black font-syne tracking-tighter">Elite E-commerce Brasil</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Grupo exclusivo com 1.200+ lojistas. Benchmarks semanais, táticas reais e suporte entre pares.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://wa.me/5511999999999?text=Quero+entrar+na+comunidade+Elite+E-commerce"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              <MessageCircle className="w-4 h-4" /> Entrar no grupo WhatsApp
            </a>
            <a
              href="https://t.me/eliteecommercebr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-border/50 hover:bg-white/5 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              Telegram →
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground">Gratuito para todos os usuários LTV Boost · Aprovação em até 24h</p>
        </div>

        <div className="text-center space-y-4 pt-12 border-t border-[#1E1E2E]">
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">🛡️ Garantia de 14 dias · Cancele quando quiser</p>
        </div>
      </div>
    </div>
  );
}
