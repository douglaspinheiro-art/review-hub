import { useState } from "react";
import { 
  TrendingUp, Monitor, Smartphone, ArrowDown, 
  Info, AlertTriangle, RefreshCw, ChevronRight,
  Filter, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LineChart, Line, AreaChart, Area
} from "recharts";
import { mockMetricas } from "@/lib/mock-data";

export default function Funil() {
  const [period, setPeriod] = useState("30d");

  const m = mockMetricas;
  
  const funnelData = [
    { step: "Visitantes", total: m.visitantes, mobile: m.visitantes_mobile, desktop: m.visitantes_desktop },
    { step: "Produto Visto", total: m.produto_visto, mobile: Math.round(m.produto_visto * 0.6), desktop: Math.round(m.produto_visto * 0.4) },
    { step: "Carrinho", total: m.carrinho, mobile: m.carrinho * 0.33, desktop: m.carrinho * 0.67 },
    { step: "Checkout", total: m.checkout, mobile: m.checkout * 0.5, desktop: m.checkout * 0.5 },
    { step: "Pedido", total: m.pedido, mobile: m.pedidos_mobile, desktop: m.pedidos_desktop },
  ];

  const chartData = [
    { data: "01/04", cvr: 1.2, bench: 2.8 },
    { data: "05/04", cvr: 1.4, bench: 2.8 },
    { data: "10/04", cvr: 1.1, bench: 2.8 },
    { data: "15/04", cvr: 1.6, bench: 2.8 },
    { data: "20/04", cvr: 1.4, bench: 2.8 },
    { data: "25/04", cvr: 1.5, bench: 2.8 },
    { data: "30/04", cvr: 1.4, bench: 2.8 },
  ];

  const getDrop = (current: number, prev: number) => {
    if (prev === 0) return 0;
    return Math.round((1 - current / prev) * 100);
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Funil de Conversão</h1>
          <p className="text-muted-foreground text-sm mt-1">Análise profunda do comportamento de compra por dispositivo.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
            <Filter className="w-4 h-4" /> [Consolidado]
          </Button>
          <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
            <RefreshCw className="w-4 h-4" /> Sincronizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border rounded-2xl p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Funil Visual
            </h3>
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /> Total</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500" /> Mobile</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500" /> Desktop</span>
            </div>
          </div>

          <div className="space-y-6">
            {funnelData.map((d, i) => (
              <div key={d.step} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{d.step}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold">{(d.total || 0).toLocaleString('pt-BR')}</span>
                    {i > 0 && (
                      <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-500 font-bold">
                        -{getDrop(d.total, funnelData[i-1].total)}% drop
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="h-8 w-full bg-muted/30 rounded-lg overflow-hidden flex">
                  <div 
                    className="h-full bg-primary transition-all duration-1000" 
                    style={{ width: `${(d.total / funnelData[0].total) * 100}%` }} 
                  />
                </div>
                <div className="flex gap-1 mt-1">
                  <div className="h-1 bg-indigo-500/50 rounded-full" style={{ width: `${(d.mobile / funnelData[0].total) * 100}%` }} />
                  <div className="h-1 bg-slate-500/50 rounded-full" style={{ width: `${(d.desktop / funnelData[0].total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
            <h3 className="font-bold text-base mb-2 flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-4 h-4" /> Alerta de Gap
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Seus usuários mobile convertem <span className="text-red-500 font-bold">2.8x menos</span> que desktop. Otimizar o checkout mobile pode recuperar <span className="text-foreground font-bold">+R$ 21.000/mês</span>.
            </p>
            <Button className="w-full mt-4 bg-red-500 hover:bg-red-600 text-white font-bold h-10 rounded-xl">
              Ver problemas de UX Mobile
            </Button>
          </div>

          <div className="bg-card border rounded-2xl p-6">
            <h3 className="font-bold text-base mb-4 uppercase tracking-tighter">Conversão por Dispositivo</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-indigo-500" />
                  </div>
                  <span className="text-sm font-bold">Mobile</span>
                </div>
                <span className="text-lg font-black font-syne text-indigo-500">{m.cvr_mobile}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-slate-500" />
                  </div>
                  <span className="text-sm font-bold">Desktop</span>
                </div>
                <span className="text-lg font-black font-syne text-slate-500">{m.cvr_desktop}%</span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-border/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Gap Mobile vs Desktop</span>
                <span className="text-xs font-bold text-red-500">-1.45pp ⚠️</span>
              </div>
              <Progress value={38} className="h-1.5" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6">
        <h3 className="font-bold text-base mb-6 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> Histórico de Conversão vs Benchmark
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorCvr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
              <XAxis dataKey="data" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} unit="%" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
              />
              <Area type="monotone" dataKey="cvr" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorCvr)" strokeWidth={3} />
              <Line type="monotone" dataKey="bench" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Progress({ value, className }: { value: number, className?: string }) {
  return (
    <div className={cn("w-full bg-muted rounded-full overflow-hidden", className)}>
      <div className="h-full bg-red-500 transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
