import { useState } from "react";
import { 
  BarChart3, PieChart, TrendingUp, Calendar, 
  Download, Filter, ArrowUpRight, Users, 
  ShoppingBag, MousePointer2, Smartphone, Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, Cell, Pie
} from "recharts";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { mockLoja, mockMetricas } from "@/lib/mock-data";

const rfmData = [
  { x: 1, y: 1, z: 432, name: "Perdidos" },
  { x: 2, y: 2, z: 145, name: "Hibernando" },
  { x: 3, y: 2, z: 234, name: "Em Risco" },
  { x: 4, y: 3, z: 56, name: "Promissores" },
  { x: 5, y: 1, z: 87, name: "Novos" },
  { x: 4, y: 4, z: 189, name: "Potencial Fiel" },
  { x: 5, y: 4, z: 234, name: "Fiéis" },
  { x: 5, y: 5, z: 124, name: "Campeões" },
];

const heatmapData = [
  { day: "Seg", hour: "08h", value: 45 }, { day: "Seg", hour: "12h", value: 82 }, { day: "Seg", hour: "18h", value: 65 },
  { day: "Ter", hour: "08h", value: 52 }, { day: "Ter", hour: "12h", value: 94 }, { day: "Ter", hour: "18h", value: 72 },
  { day: "Qua", hour: "08h", value: 48 }, { day: "Qua", hour: "12h", value: 88 }, { day: "Qua", hour: "18h", value: 68 },
  { day: "Qui", hour: "08h", value: 61 }, { day: "Qui", hour: "12h", value: 91 }, { day: "Qui", hour: "18h", value: 75 },
  { day: "Sex", hour: "08h", value: 55 }, { day: "Sex", hour: "12h", value: 78 }, { day: "Sex", hour: "18h", value: 58 },
  { day: "Sab", hour: "08h", value: 32 }, { day: "Sab", hour: "12h", value: 45 }, { day: "Sab", hour: "18h", value: 42 },
  { day: "Dom", hour: "08h", value: 28 }, { day: "Dom", hour: "12h", value: 52 }, { day: "Dom", hour: "18h", value: 61 },
];

const COLORS = ["#ef4444", "#f59e0b", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#8b5cf6", "#10b981"];

export default function Relatorios() {
  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Relatórios Avançados</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão analítica completa para decisões baseadas em dados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
            <Download className="w-4 h-4" /> Exportar PDF
          </Button>
          <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
            <Filter className="w-4 h-4" /> Filtros
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="LTV Médio" value="R$ 1.520" trend={+8} icon={TrendingUp} />
        <MetricCard label="CAC" value="R$ 42,50" trend={-12} icon={Users} />
        <MetricCard label="ROAS Médio" value="12.4x" trend={+15} icon={ShoppingBag} />
        <MetricCard label="Churn Rate" value="4.2%" trend={-2} icon={PieChart} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição RFM */}
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-bold text-base mb-6 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" /> Matriz RFM (Volume de Clientes)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis type="number" dataKey="x" name="Recência" axisLine={false} tick={{fontSize: 10}} label={{ value: 'Recência', position: 'insideBottom', offset: -10, fontSize: 10 }} />
                <YAxis type="number" dataKey="y" name="Frequência" axisLine={false} tick={{fontSize: 10}} label={{ value: 'Frequência', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <ZAxis type="number" dataKey="z" range={[100, 2000]} name="Clientes" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }} />
                <Scatter name="Segmentos" data={rfmData}>
                  {rfmData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.6} stroke={COLORS[index % COLORS.length]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {rfmData.map((d, i) => (
              <Badge key={i} variant="outline" className="text-[8px] uppercase tracking-tighter" style={{ borderColor: `${COLORS[i]}44`, color: COLORS[i] }}>
                {d.name}: {d.z}
              </Badge>
            ))}
          </div>
        </div>

        {/* Heatmap de Engajamento */}
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-bold text-base mb-6 flex items-center gap-2">
            <MousePointer2 className="w-4 h-4 text-primary" /> Heatmap: Melhor Horário de Abertura
          </h3>
          <div className="grid grid-cols-8 gap-1">
            <div className="h-8" />
            {["08h", "12h", "18h"].map(h => <div key={h} className="text-[10px] font-bold text-muted-foreground text-center">{h}</div>)}
            <div className="col-span-4" />
            
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map(day => (
              <>
                <div key={day} className="text-[10px] font-bold text-muted-foreground flex items-center">{day}</div>
                {["08h", "12h", "18h"].map(hour => {
                  const val = heatmapData.find(d => d.day === day && d.hour === hour)?.value || 0;
                  const opacity = val / 100;
                  return (
                    <div 
                      key={`${day}-${hour}`} 
                      className="h-8 rounded-md transition-all hover:scale-110 cursor-help"
                      style={{ backgroundColor: `rgba(16, 185, 129, ${opacity})`, border: `1px solid rgba(16, 185, 129, ${opacity + 0.1})` }}
                      title={`${val}% de abertura`}
                    />
                  );
                })}
                <div className="col-span-4" />
              </>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-6 italic text-center">
            * Terças e Quintas às 12h apresentam a maior taxa de conversão histórica.
          </p>
        </div>
      </div>

      {/* Cohort de Retenção */}
      <div className="bg-card border rounded-2xl p-6">
        <h3 className="font-bold text-base mb-6 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Cohort de Retenção (Mensal)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-bold uppercase tracking-widest border-collapse">
            <thead>
              <tr className="border-b border-border/50">
                <th className="p-2 text-left">Mês Início</th>
                <th className="p-2 text-center bg-muted/20">Novos</th>
                {[1, 2, 3, 4, 5, 6].map(m => <th key={m} className="p-2 text-center">M{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Out 2025", n: 120, data: [100, 42, 35, 28, 22, 18] },
                { label: "Nov 2025", n: 145, data: [100, 45, 38, 31, 25] },
                { label: "Dez 2025", n: 210, data: [100, 52, 41, 34] },
                { label: "Jan 2026", n: 180, data: [100, 48, 39] },
                { label: "Fev 2026", n: 165, data: [100, 44] },
                { label: "Mar 2026", n: 195, data: [100] },
              ].map((row, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="p-2 text-muted-foreground">{row.label}</td>
                  <td className="p-2 text-center bg-muted/10">{row.n}</td>
                  {row.data.map((val, j) => {
                    const opacity = val / 100;
                    return (
                      <td key={j} className="p-2 text-center">
                        <div 
                          className="py-1 rounded" 
                          style={{ backgroundColor: `rgba(59, 130, 246, ${opacity})`, color: val > 50 ? '#fff' : 'inherit' }}
                        >
                          {val}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
