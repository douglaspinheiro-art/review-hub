import { useState } from "react";
import { 
  Sparkles, Filter, CheckCircle2, XCircle, 
  Settings, Zap, RefreshCw, ChevronRight, Lock 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrescriptionCard } from "@/components/dashboard/PrescriptionCard";
import { mockPrescricoes } from "@/lib/mock-data";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Confetti } from "@/components/dashboard/Confetti";

export default function Prescricoes() {
  const [activeTab, setActiveTab] = useState("aguardando");
  const [showConfetti, setShowConfetti] = useState(false);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isStarter = profile?.plan === "starter";

  const handleAprovar = (id: string) => {
    setShowConfetti(true);
    toast.success("Prescrição aprovada!", {
      description: "A IA iniciou o disparo para os clientes aptos.",
    });
    setTimeout(() => setShowConfetti(false), 3000);
  };

  return (
    <div className="space-y-8 pb-24 md:pb-10 relative">
      <Confetti trigger={showConfetti} />
      
      {/* Mobile Sticky Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-50 flex gap-3 animate-in slide-in-from-bottom-full duration-500">
        <Button variant="outline" className="flex-1 h-12 font-bold rounded-xl" onClick={() => navigate('/dashboard')}>
          Voltar
        </Button>
        <Button className="flex-[2] h-12 font-black bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 gap-2" onClick={() => handleAprovar('bulk')}>
          Aprovar Tudo do Dia <Zap className="w-4 h-4 fill-current" />
        </Button>
      </div>

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
                      onAprovar={() => handleAprovar(p.id)}
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
                        variant="primary" 
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
