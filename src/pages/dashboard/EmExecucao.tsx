import { useState } from "react";
import { 
  Sparkles, Zap, MessageCircle, Mail, Send, 
  TrendingUp, Users, Clock, ArrowRight, Play, Pause,
  BarChart3, CheckCircle2, AlertCircle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export default function EmExecucao() {
  const [isRefreshing, setIsSyncing] = useState(false);

  const activePrescriptions = [
    {
      id: "ex1",
      titulo: "Reativação de clientes dormentes",
      canal: "whatsapp",
      status: "em_execucao",
      progresso: 38,
      metricas: {
        enviados: 708,
        entregues: 695,
        abertos: 494,
        conversoes: 89,
        receita: 11200
      },
      ab_test: {
        ativo: true,
        grupo_a: { label: "Variante A (12%)", cvr: 8.3, receita: 1247 },
        grupo_b: { label: "Controle (3%)", cvr: 3.1, receita: 465 },
        lift: 168,
        confianca: 94
      }
    }
  ];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Recovery Tracker</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhamento em tempo real das prescrições aprovadas.</p>
        </div>
        <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
          <RefreshCw className="w-4 h-4" /> Atualizar Métricas
        </Button>
      </div>

      <div className="space-y-6">
        {activePrescriptions.map((p) => (
          <div key={p.id} className="bg-card border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border/50 bg-muted/10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Zap className="w-6 h-6 fill-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-none mb-1">{p.titulo}</h3>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] font-bold uppercase">
                        {p.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> WhatsApp
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-9 rounded-lg font-bold gap-2">
                    <Pause className="w-3.5 h-3.5" /> Pausar
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 rounded-lg font-bold gap-2">
                    <BarChart3 className="w-3.5 h-3.5" /> Relatório Detalhado
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gap de Conversão Fechado</span>
                    <span className="text-xs font-black font-syne text-primary">{p.progresso}%</span>
                  </div>
                  <Progress value={p.progresso} className="h-2" />
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Meta: <span className="font-bold text-foreground">2.50%</span> • Atual: <span className="font-bold text-emerald-500">1.67%</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/30 rounded-xl">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Enviados</span>
                    <div className="text-lg font-black font-syne">{p.metricas.enviados}</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-xl">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Abertos</span>
                    <div className="text-lg font-black font-syne">{Math.round((p.metricas.abertos / p.metricas.enviados) * 100)}%</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-xl">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Conversões</span>
                    <div className="text-lg font-black font-syne text-emerald-500">{p.metricas.conversoes}</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-xl">
                    <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Receita</span>
                    <div className="text-lg font-black font-syne text-emerald-500">R$ 11.2k</div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                {p.ab_test.ativo && (
                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-500" /> Performance Teste A/B
                      </h4>
                      <Badge className="bg-indigo-500/10 text-indigo-500 border-0 text-[10px] font-black">
                        CONFIANÇA: {p.ab_test.confianca}%
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold">{p.ab_test.grupo_a.label}</span>
                          <span className="text-xs font-black font-syne">{p.ab_test.grupo_a.cvr}%</span>
                        </div>
                        <div className="h-2 bg-indigo-500 rounded-full" />
                        <span className="text-[10px] text-muted-foreground">R$ {p.ab_test.grupo_a.receita} gerados</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center opacity-50">
                          <span className="text-xs font-bold">{p.ab_test.grupo_b.label}</span>
                          <span className="text-xs font-black font-syne">{p.ab_test.grupo_b.cvr}%</span>
                        </div>
                        <div className="h-2 bg-muted-foreground/20 rounded-full" />
                        <span className="text-[10px] text-muted-foreground">R$ {p.ab_test.grupo_b.receita} gerados</span>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-indigo-500/10">
                      <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                        <TrendingUp className="w-4 h-4" /> Lift de +{p.ab_test.lift}% identificado
                      </div>
                      <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 rounded-lg text-xs gap-2">
                        <Play className="w-3.5 h-3.5 fill-current" /> Escalar para 100% da base
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="bg-muted/30 border border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground opacity-20" />
          </div>
          <h3 className="font-bold text-base text-muted-foreground">Nenhuma outra prescrição ativa</h3>
          <p className="text-xs text-muted-foreground/60 max-w-[280px] mt-2">
            Aprove novas prescrições na Central de Inteligência para aumentar seu faturamento.
          </p>
        </div>
      </div>
    </div>
  );
}
