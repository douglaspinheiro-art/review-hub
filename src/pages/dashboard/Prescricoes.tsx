import { useState } from "react";
import {
  Sparkles, Filter, CheckCircle2, XCircle,
  Settings, Zap, RefreshCw, ChevronRight, Lock, TrendingUp, ArrowRight, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrescriptionCard } from "@/components/dashboard/PrescriptionCard";
import { mockPrescricoes } from "@/lib/mock-data";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Confetti } from "@/components/dashboard/Confetti";
import { TrialGate } from "@/components/dashboard/TrialGate";

// Simulated value the user would have recovered in Escala vs current plan
const UPSELL_EXTRA_VALUE = 4_320;

export default function Prescricoes() {
  const [activeTab, setActiveTab] = useState("aguardando");
  const [showConfetti, setShowConfetti] = useState(false);
  const [showUpsellBanner, setShowUpsellBanner] = useState(true);
  const [showTrialGate, setShowTrialGate] = useState(false);
  const { profile, isTrialActive } = useAuth();
  const navigate = useNavigate();
  const isStarter = profile?.plan === "starter";
  const isNotScale = profile?.plan !== "scale" && profile?.plan !== "enterprise";

  const handleAprovar = (p: typeof mockPrescricoes[number]) => {
    if (isTrialActive) { setShowTrialGate(true); return; }

    const segmentMap: Record<string, "inactive" | "vip" | "all" | "active" | "cart_abandoned"> = {
      em_risco: "inactive",
      campiao: "vip",
      carrinho: "cart_abandoned",
    };
    const objectiveMap: Record<string, "recovery" | "rebuy" | "loyalty" | "lancamento"> = {
      em_risco: "recovery",
      carrinho: "recovery",
      campiao: "loyalty",
    };

    const prefill = {
      name: p.titulo,
      message: p.preview_msg?.replace(/\[Nome\]/g, "{{nome}}") ?? "",
      objective: objectiveMap[p.segmento] ?? "rebuy",
      channel: p.canal as "whatsapp" | "email" | "sms",
      segment: segmentMap[p.segmento] ?? "all",
      skipObjective: true,
      source: "ConvertIQ",
    };

    sessionStorage.setItem("campaign_prefill", JSON.stringify(prefill));
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 2000);
    navigate("/dashboard/campanhas?new=true");
  };

  return (
    <div className="space-y-8 pb-24 md:pb-10 relative">
      <Confetti trigger={showConfetti} />

      {/* Trial Gate Dialog */}
      <Dialog open={showTrialGate} onOpenChange={setShowTrialGate}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-center font-black text-xl">Ative seu plano para continuar</DialogTitle>
            <DialogDescription className="text-center">
              Seu acesso de demonstração permite <strong>visualizar</strong> todas as funcionalidades,
              mas para aprovar prescrições você precisa de um plano ativo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Button className="font-black rounded-xl" onClick={() => { setShowTrialGate(false); navigate("/upgrade"); }}>
              Ver planos e ativar agora
            </Button>
            <Button variant="ghost" onClick={() => setShowTrialGate(false)} className="text-muted-foreground">
              Continuar explorando
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Mobile Sticky Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-50 flex gap-3 animate-in slide-in-from-bottom-full duration-500">
        <Button variant="outline" className="flex-1 h-12 font-bold rounded-xl" onClick={() => navigate('/dashboard')}>
          Voltar
        </Button>
        <TrialGate action="aprovar prescrições">
          <Button className="flex-[2] h-12 font-black bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 gap-2" onClick={() => mockPrescricoes[0] && handleAprovar(mockPrescricoes[0])}>
            Aprovar Tudo do Dia <Zap className="w-4 h-4 fill-current" />
          </Button>
        </TrialGate>
      </div>

      {/* Conceito explicativo — mostrado apenas no primeiro acesso */}
      {!localStorage.getItem("ltv_prescricoes_visto") && (
        <div className="bg-card border border-primary/20 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 items-start animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1.5">
            <p className="font-black text-sm">O que são Prescrições?</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A IA analisa o comportamento da sua loja em tempo real e gera <strong className="text-foreground">ações pontuais e priorizadas</strong> — como disparar uma campanha para clientes que abandonaram carrinho nas últimas 4h, ou reativar clientes VIP inativos há 45 dias. Cada aprovação dispara a ação automaticamente via WhatsApp.
            </p>
            <p className="text-xs text-muted-foreground">
              💡 Dica: prescrições com prioridade <span className="font-bold text-red-500">CRÍTICA</span> têm janela de tempo limitada — aprove primeiro.
            </p>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              localStorage.setItem("ltv_prescricoes_visto", "1");
              const el = document.getElementById("prescricoes-banner");
              if (el) el.style.display = "none";
            }}
            id="prescricoes-banner-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Central de Prescrições</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ações inteligentes geradas pela IA para recuperar sua conversão.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            className="font-bold gap-2 rounded-xl relative overflow-hidden group"
            onClick={() => isStarter ? navigate('/planos') : null}
          >
            <Settings className="w-4 h-4" /> Configurar Aprovação Automática
            {isStarter && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Lock className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
          </Button>
        </div>
      </div>

      {isNotScale && showUpsellBanner && (
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-foreground leading-tight">
                No plano Escala, você teria recuperado <span className="text-primary">R$ {UPSELL_EXTRA_VALUE.toLocaleString('pt-BR')} a mais</span> este mês
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Prescrições avançadas, A/B test automático e aprovação automática desbloqueadas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="h-8 font-black text-[10px] uppercase tracking-widest gap-1.5 rounded-xl" onClick={() => navigate('/planos')}>
              Ver Escala <ArrowRight className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowUpsellBanner(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="aguardando" className="w-full" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-6 overflow-x-auto gap-4 pb-2">
          <TabsList className="bg-muted/50 p-1 rounded-xl shrink-0">
            <TabsTrigger value="aguardando" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Aguardando <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-0">{mockPrescricoes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="execucao" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Em Execução
            </TabsTrigger>
            <TabsTrigger value="concluidas" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Concluídas
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="text-xs font-bold gap-1 text-muted-foreground">
              <Filter className="w-3.5 h-3.5" /> Filtrar
            </Button>
            <Button variant="ghost" size="sm" className="text-xs font-bold gap-1 text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </Button>
          </div>
        </div>

        <TabsContent value="aguardando" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockPrescricoes.map((p) => {
              const isLocked = isStarter && p.ab_teste_ativo;
              return (
                <div key={p.id} className="relative group">
                  <div className={isLocked ? "opacity-40 grayscale pointer-events-none" : ""}>
                    <PrescriptionCard 
                      {...p as any}
                      onAprovar={() => handleAprovar(p)}
                      onRejeitar={() => console.log("Rejeitado", p.id)}
                    />
                  </div>
                  {isLocked && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-background/20 backdrop-blur-[2px] rounded-2xl border border-dashed border-border group-hover:bg-background/40 transition-all">
                      <div className="w-10 h-10 rounded-full bg-card border shadow-sm flex items-center justify-center mb-3">
                        <Lock className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-xs uppercase tracking-tighter mb-1">A/B Teste Recomendado</h4>
                      <p className="text-[10px] text-muted-foreground mb-4">Disponível no plano Growth</p>
                      <Button 
                        size="sm" 
                        variant="default" 
                        className="h-8 font-bold text-[10px] uppercase tracking-widest px-4 rounded-lg bg-primary text-primary-foreground"
                        onClick={() => navigate('/planos')}
                      >
                        Fazer Upgrade
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Locked Card Mock */}
            <div className="bg-card/50 border border-dashed border-border/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center relative group overflow-hidden">
              <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-6">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-muted-foreground" />
                </div>
                <h4 className="font-bold text-sm mb-1 uppercase tracking-tighter">Disponível no plano Growth</h4>
                <p className="text-xs text-muted-foreground mb-4">Prescrições ilimitadas e automações avançadas.</p>
                <Button size="sm" className="font-bold text-[10px] uppercase tracking-widest rounded-lg">Fazer Upgrade</Button>
              </div>
              <div className="w-full space-y-4 opacity-20 grayscale">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-20 bg-muted rounded" />
                <div className="h-8 bg-muted rounded" />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="execucao" className="mt-0">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold">Nenhuma prescrição em execução</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
              Aprove as sugestões da IA na aba "Aguardando" para começar a recuperar sua conversão.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="concluidas" className="mt-0">
          <div className="bg-card border rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prescrição</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resultados</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm">Recuperação de Boleto VIP</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold">WhatsApp • Segmento: Campeão</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] font-bold">CONCLUÍDA</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-emerald-500">+ R$ 8.940</div>
                    <div className="text-[10px] text-muted-foreground font-bold">67 conversões</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">124x</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
