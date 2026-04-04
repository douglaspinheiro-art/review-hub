import { useState } from "react";
import { 
  TrendingUp, Sparkles, Calendar, ArrowUpRight, 
  Info, InfoIcon, ShieldCheck, Zap, MousePointer2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, LineChart, Line 
} from "recharts";
import { MetricCard } from "@/components/dashboard/MetricCard";

const data = [
  { name: "Semana 1", atual: 10000, com_presc: 10000, com_ux: 10000 },
  { name: "Semana 2", atual: 12000, com_presc: 13500, com_ux: 14000 },
  { name: "Semana 3", atual: 11500, com_presc: 15000, com_ux: 17000 },
  { name: "Semana 4", atual: 13000, com_presc: 19000, com_ux: 22000 },
  { name: "Próximos 30d", atual: 12500, com_presc: 24000, com_ux: 28000 },
];

export default function Forecast() {
  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Revenue Forecast</h1>
        <p className="text-muted-foreground text-sm mt-1">Previsão de faturamento baseada em histórico, IA e sazonalidade.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-card border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Projeção de Receita (30 dias)
            </h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Realizado
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-emerald-500">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Com Prescrições
              </div>
            </div>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorAtual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPresc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} tickFormatter={(v) => `R$ ${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="atual" stroke="#888888" fillOpacity={1} fill="url(#colorAtual)" strokeWidth={2} strokeDasharray="5 5" />
                <Area type="monotone" dataKey="com_presc" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorPresc)" strokeWidth={4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-primary/20 bg-primary/5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-12 h-12" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">Cenário Otimista</h3>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground block">Receita Prevista</span>
                <span className="text-3xl font-black font-syne tracking-tighter">R$ 57.400</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                <ArrowUpRight className="w-4 h-4" /> +R$ 16.400 (vs atual)
              </div>
              <div className="pt-4 border-t border-primary/10">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Baseado em 3 prescrições ativas e sazonalidade do <span className="text-foreground font-bold">Dia das Mães</span> (+67% de lift histórico).
                </p>
              </div>
            </div>
          </Card>

          <div className="bg-card border rounded-2xl p-6">
            <h3 className="font-bold text-sm uppercase tracking-tighter text-muted-foreground mb-4">E se... (Cenários)</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                    <MousePointer2 className="w-4 h-4 text-indigo-500" />
                  </div>
                  <span className="text-xs font-bold">Resolver Gap Mobile</span>
                </div>
                <span className="text-xs font-black text-emerald-500">+R$ 21k</span>
              </div>
              <div className="flex items-center justify-between group cursor-pointer opacity-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-purple-500" />
                  </div>
                  <span className="text-xs font-bold">Fidelidade Ativo</span>
                </div>
                <span className="text-xs font-black text-emerald-500">+R$ 8k</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-bold text-base mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Base de Cálculo
          </h3>
          <ul className="space-y-3">
            {[
              "Histórico de 6 meses de transações",
              "Performance de 94 lojas do mesmo segmento (Moda)",
              "Eventos sazonais nacionais e regionais",
              "Taxa de conversão atual de 1.40%",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {item}
              </li>
            ))}
          </ul>
        </div>
        
        <div className="bg-muted/30 border border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center">
          <InfoIcon className="w-8 h-8 text-muted-foreground mb-3" />
          <h4 className="font-bold text-sm mb-1">Acurácia da Previsão: 92%</h4>
          <p className="text-[10px] text-muted-foreground max-w-[200px]">
            Nossa IA aprende com cada prescrição executada, aumentando a precisão ao longo do tempo.
          </p>
        </div>
      </div>
    </div>
  );
}
