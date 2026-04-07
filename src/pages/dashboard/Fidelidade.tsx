import { useState } from "react";
import {
  Gift, Star, Trophy, Users,
  Plus, Settings2, ChevronRight,
  Coins, Award, Target, Sparkles, TrendingUp, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";

const RECOMPENSAS = [
  { id: 1, nome: "Crédito R$ 20", valor: 20, status: "Ativo" },
  { id: 2, nome: "Crédito R$ 50", valor: 50, status: "Ativo" },
  { id: 3, nome: "Crédito R$ 100", valor: 100, status: "Pausado" },
];

export default function Fidelidade() {
  const [cashbackEnabled, setCashbackEnabled] = useState(true);
  const [cashbackPercent, setCashbackPercent] = useState(5);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Motor de Cashback</h1>
          <p className="text-muted-foreground text-sm mt-1">Transforme cada venda em um gatilho para a próxima compra.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="font-bold gap-2 rounded-xl border-2">
            <Settings2 className="w-4 h-4" /> Configurar Regras
          </Button>
          <Button className="font-bold gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20">
            <Plus className="w-4 h-4" /> Novo Programa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Clientes com Saldo" value="1.240" trend={+8} icon={Users} />
        <MetricCard label="Créditos Emitidos" value="R$ 24.8k" trend={+15} icon={Coins} />
        <MetricCard label="Créditos Resgatados" value="R$ 8.2k" icon={Gift} />
        <MetricCard label="Lucro Incremental" value="R$ 42.5k" trend={+12} icon={TrendingUp} className="border-emerald-500/30 bg-emerald-500/[0.02]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuração de Cashback */}
        <div className="bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-[2rem] p-8 lg:col-span-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-emerald-500/10 transition-all duration-1000" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black font-syne text-lg tracking-tighter uppercase flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-500" /> Programa de Cashback Ativo
              </h3>
              <Switch checked={cashbackEnabled} onCheckedChange={setCashbackEnabled} />
            </div>

            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Percentual de Retorno</Label>
                    <span className="text-2xl font-black font-mono text-emerald-500">{cashbackPercent}%</span>
                  </div>
                  <input 
                    type="range" min="1" max="25" step="1" 
                    value={cashbackPercent} 
                    onChange={(e) => setCashbackPercent(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer" 
                  />
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed italic">
                    * Recomendação: 5% a 8% gera o melhor equilíbrio entre margem e retenção.
                  </p>
                </div>

                <div className="p-5 bg-background/50 rounded-2xl border border-border/30 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-emerald-500" />
                    </div>
                    <span className="text-xs font-black tracking-tight">Gatilho de Expiração</span>
                  </div>
                  <div className="flex gap-2">
                    {["30 dias", "60 dias", "90 dias"].map(d => (
                      <button key={d} className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase border-2 border-transparent bg-muted/50 hover:border-emerald-500/30 transition-all">
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-background/40 rounded-3xl p-6 border border-border/20 flex flex-col justify-center">
                <div className="text-center space-y-2 mb-6">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Impacto Estimado</p>
                  <p className="text-3xl font-black font-mono text-emerald-500">R$ 12.440</p>
                  <p className="text-[10px] text-muted-foreground">Extra nos próximos 30 dias</p>
                </div>
                <div className="space-y-2">
                  <Progress value={75} className="h-1.5 bg-muted" />
                  <div className="flex justify-between text-[9px] font-black uppercase text-muted-foreground/60">
                    <span>Performance</span>
                    <span>Alta</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview do Widget Premium */}
        <div className="bg-[#0A0A0F] border-2 border-[#1E1E2E] rounded-[2rem] p-8 relative overflow-hidden flex flex-col group">
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform duration-1000">
            <Sparkles className="w-16 h-16 text-emerald-500" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-10">Interface do Cliente</span>
          
          <div className="bg-background/80 backdrop-blur-xl border-2 border-emerald-500/20 rounded-[2.5rem] p-6 space-y-6 shadow-2xl mt-auto self-center w-full max-w-[280px] transform rotate-1 group-hover:rotate-0 transition-all duration-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-600 rounded-xl flex items-center justify-center font-black text-[12px] text-white italic shadow-lg shadow-emerald-900/40">L</div>
                <span className="text-[11px] font-black tracking-tighter uppercase">Clube Elite</span>
              </div>
              <Badge variant="outline" className="text-[8px] font-black h-4 border-emerald-500/30 text-emerald-500 px-2 tracking-widest">OURO</Badge>
            </div>
            
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground/60 font-black uppercase tracking-widest">Seu Saldo Disponível</p>
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-500" />
                <span className="text-2xl font-black font-mono tracking-tighter">R$ 142,50</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span>Resgate imediato</span>
                <span className="text-emerald-500">Disponível</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-full" />
              </div>
            </div>

            <Button size="sm" className="w-full h-11 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl bg-emerald-600 hover:bg-emerald-500 border-0 shadow-lg shadow-emerald-900/30">Gerar Cupom</Button>
          </div>
          
          <p className="text-[10px] text-muted-foreground/40 text-center mt-10 italic px-4 font-medium leading-relaxed">
            * Seus clientes visualizam o saldo de cashback no checkout e na área do cliente.
          </p>
        </div>
      </div>

      {/* Tabela de Campanhas de Cashback */}
      <div className="bg-card/30 backdrop-blur-sm border-2 border-border/50 rounded-[2rem] overflow-hidden">
        <div className="p-6 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-black font-syne text-sm uppercase tracking-tighter text-muted-foreground flex items-center gap-2">
            <Gift className="w-4 h-4" /> Histórico de Resgates
          </h3>
          <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-primary">Exportar CSV</Button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Cliente</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Crédito Gerado</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Origem</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Status</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 1, nome: "Ana Paula Silva", valor: "R$ 42,50", origem: "Pedido #8421", status: "Disponível" },
              { id: 2, nome: "Carlos Eduardo", valor: "R$ 15,00", origem: "Review Google", status: "Utilizado" },
              { id: 3, nome: "Juliana Mendes", valor: "R$ 89,90", origem: "Campanha VIP", status: "Expirado" },
            ].map((r) => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-primary/[0.02] transition-colors group">
                <td className="px-8 py-5">
                  <div className="font-black text-sm tracking-tight">{r.nome}</div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2 text-sm font-mono font-black text-emerald-500">
                    {r.valor}
                  </div>
                </td>
                <td className="px-8 py-5 text-xs font-bold text-muted-foreground">{r.origem}</td>
                <td className="px-8 py-5">
                  <Badge className={cn(
                    "text-[9px] font-black uppercase border-0 px-2 py-0.5",
                    r.status === "Disponível" ? "bg-emerald-500/10 text-emerald-500" : 
                    r.status === "Utilizado" ? "bg-blue-500/10 text-blue-500" : "bg-muted text-muted-foreground"
                  )}>
                    {r.status}
                  </Badge>
                </td>
                <td className="px-8 py-5 text-right">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
