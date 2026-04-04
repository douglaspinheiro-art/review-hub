import { useState } from "react";
import { 
  Gift, Star, Trophy, Users, 
  Plus, Settings2, ChevronRight, 
  Coins, Award, Target, Sparkles, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";

const TIERS = [
  { name: "Bronze", min: 0, color: "text-amber-700", bg: "bg-amber-700/10", multiplier: "1x" },
  { name: "Prata", min: 500, color: "text-slate-400", bg: "bg-slate-400/10", multiplier: "1.2x" },
  { name: "Ouro", min: 1500, color: "text-yellow-500", bg: "bg-yellow-500/10", multiplier: "1.5x" },
  { name: "Diamante", min: 5000, color: "text-blue-400", bg: "bg-blue-400/10", multiplier: "2x" },
];

const RECOMPENSAS = [
  { id: 1, nome: "Cupom R$ 20", pontos: 200, status: "Ativo" },
  { id: 2, nome: "Frete Grátis", pontos: 150, status: "Ativo" },
  { id: 3, nome: "Brinde Exclusivo", pontos: 500, status: "Pausado" },
];

export default function Fidelidade() {
  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Programa de Fidelidade</h1>
          <p className="text-muted-foreground text-sm mt-1">Transforme cada real gasto em retenção e recompra.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="font-bold gap-2 rounded-xl">
            <Settings2 className="w-4 h-4" /> Regras de Pontuação
          </Button>
          <Button className="font-bold gap-2 rounded-xl">
            <Plus className="w-4 h-4" /> Nova Recompensa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Clientes Ativos" value="842" trend={+5} icon={Users} />
        <MetricCard label="Pontos Emitidos" value="124k" trend={+12} icon={Coins} />
        <MetricCard label="Pontos Resgatados" value="38k" icon={Gift} />
        <MetricCard label="Impacto LTV" value="+22%" trend={+4} icon={TrendingUp} className="border-emerald-500/20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tiers / Níveis */}
        <div className="bg-card border rounded-2xl p-6 lg:col-span-2">
          <h3 className="font-bold text-base mb-6 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Níveis da Comunidade
          </h3>
          <div className="space-y-6">
            {TIERS.map((t, i) => (
              <div key={t.name} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black", t.bg, t.color)}>
                      {t.name[0]}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase font-black">A partir de {t.min} pontos</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-primary">{t.multiplier} pontos</div>
                    <div className="text-[9px] text-muted-foreground uppercase font-black">Multiplicador</div>
                  </div>
                </div>
                {i < TIERS.length - 1 && (
                  <div className="absolute left-5 top-10 w-0.5 h-6 bg-muted -z-10" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Preview Widget */}
        <div className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-6 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles className="w-16 h-16 text-primary" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-6">Preview do Widget</span>
          
          <div className="bg-background border border-border/50 rounded-2xl p-5 space-y-4 shadow-2xl mt-auto self-center w-full max-w-[240px] transform rotate-2 hover:rotate-0 transition-transform duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center font-black text-[10px] text-primary-foreground italic">L</div>
                <span className="text-[10px] font-bold">Clube LTV</span>
              </div>
              <Badge variant="outline" className="text-[8px] h-4 border-emerald-500/30 text-emerald-500 px-1">OURO</Badge>
            </div>
            
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Seu saldo</p>
              <div className="flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-primary" />
                <span className="text-lg font-black font-syne">1.240</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[8px] font-bold uppercase">
                <span>Próximo Nível</span>
                <span className="text-muted-foreground">260 pts faltam</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[75%]" />
              </div>
            </div>

            <Button size="sm" className="w-full h-8 text-[9px] font-black uppercase tracking-widest rounded-lg">Resgatar Prêmios</Button>
          </div>
          
          <p className="text-[10px] text-muted-foreground text-center mt-8 italic px-4">
            * Widget flutuante que aparece para seus clientes logados na loja.
          </p>
        </div>
      </div>

      {/* Tabela de Recompensas */}
      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-tighter text-muted-foreground flex items-center gap-2">
            <Gift className="w-3.5 h-3.5" /> Recompensas Ativas
          </h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recompensa</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Custo</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resgates</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right"></th>
            </tr>
          </thead>
          <tbody>
            {RECOMPENSAS.map((r) => (
              <tr key={r.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                <td className="px-6 py-4 font-bold text-sm">{r.nome}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Coins className="w-3.5 h-3.5 text-primary" /> {r.pontos} pts
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-bold">{Math.round(Math.random() * 100)} resgates</td>
                <td className="px-6 py-4">
                  <Badge className={cn(
                    "text-[9px] font-black uppercase border-0",
                    r.status === "Ativo" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                  )}>
                    {r.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
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
