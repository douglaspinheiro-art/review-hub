import { useState } from "react";
import {
  TrendingUp, TrendingDown, Award, BarChart3,
  Sparkles, Info, ArrowRight, Target, Zap, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { cn } from "@/lib/utils";

const NICHO_DATA = {
  "Moda": { cvr_medio: 2.8, ltv_medio: 420, churn_medio: 8.2, ticket_medio: 185 },
  "Beleza": { cvr_medio: 3.1, ltv_medio: 380, churn_medio: 9.1, ticket_medio: 145 },
  "Suplementos": { cvr_medio: 3.4, ltv_medio: 680, churn_medio: 12.4, ticket_medio: 220 },
  "Eletrônicos": { cvr_medio: 1.9, ltv_medio: 890, churn_medio: 6.8, ticket_medio: 640 },
  "Casa": { cvr_medio: 2.2, ltv_medio: 310, churn_medio: 7.5, ticket_medio: 270 },
};

// Dados da loja atual (mock — virá de Supabase em produção)
const LOJA_ATUAL = {
  cvr: 1.4,
  ltv: 312,
  churn: 11.2,
  ticket: 250,
  nicho: "Moda",
  percentil_geral: 34,
};

const cvr_historico = [
  { mes: "Out", loja: 1.1, benchmark: 2.8 },
  { mes: "Nov", loja: 1.2, benchmark: 2.8 },
  { mes: "Dez", loja: 1.6, benchmark: 2.9 },
  { mes: "Jan", loja: 1.3, benchmark: 2.7 },
  { mes: "Fev", loja: 1.5, benchmark: 2.8 },
  { mes: "Mar", loja: 1.4, benchmark: 2.8 },
];

const METRICAS_COMPARATIVO = [
  { label: "CVR", sua: 1.4, media: 2.8, unidade: "%", maior_melhor: true },
  { label: "LTV", sua: 312, media: 420, unidade: "R$", maior_melhor: true },
  { label: "Churn", sua: 11.2, media: 8.2, unidade: "%", maior_melhor: false },
  { label: "Ticket", sua: 250, media: 185, unidade: "R$", maior_melhor: true },
];

const TOP_OPORTUNIDADES = [
  { area: "Taxa de Conversão", gap: "-50%", impacto: "R$ 24.500/mês", acao: "Ativar prescrições de carrinho" },
  { area: "LTV por cliente", gap: "-26%", impacto: "R$ 8.100/mês", acao: "Ativar jornada de recompra" },
  { area: "Churn rate", gap: "+37%", impacto: "R$ 5.800/mês", acao: "Ativar reativação automática" },
];

export default function BenchmarkScore() {
  const [nicho, setNicho] = useState("Moda");
  const bench = NICHO_DATA[nicho as keyof typeof NICHO_DATA];
  const percentil = LOJA_ATUAL.percentil_geral;

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Benchmark Score</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sua loja vs. {Object.keys(NICHO_DATA).length * 40}+ lojas brasileiras do mesmo nicho.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(NICHO_DATA).map(n => (
            <Button
              key={n}
              variant={nicho === n ? "default" : "outline"}
              size="sm"
              onClick={() => setNicho(n)}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      {/* Percentil Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Percentil Geral — {nicho}</div>
          <div className="relative">
            <div className="text-8xl font-black font-syne text-primary leading-none">{percentil}</div>
            <div className="text-2xl font-black text-primary/60 absolute -top-1 -right-6">º</div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold">
              Sua loja está acima de <span className="text-primary">{percentil}%</span> das lojas de {nicho}
            </p>
            <p className="text-xs text-muted-foreground">
              Faltam {100 - percentil} pontos percentuais para o top 1%
            </p>
          </div>
          <div className="w-full space-y-2">
            <Progress value={percentil} className="h-3" />
            <div className="flex justify-between text-[9px] font-black uppercase text-muted-foreground">
              <span>0%</span>
              <span className="text-amber-500">Top 25%</span>
              <span className="text-emerald-500">Top 10%</span>
              <span className="text-primary">Top 1%</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {METRICAS_COMPARATIVO.map(({ label, sua, media, unidade, maior_melhor }) => {
            const melhor = maior_melhor ? sua >= media : sua <= media;
            const pct = Math.round(((sua - media) / media) * 100);
            const absPct = Math.abs(pct);
            const barPct = Math.min(100, Math.round((sua / (media * 1.5)) * 100));
            return (
              <div key={label} className="bg-card border border-border/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-black uppercase tracking-widest">{label}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black",
                      melhor ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"
                    )}>
                      {melhor ? "+" : ""}{pct}% vs benchmark
                    </Badge>
                    {melhor
                      ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                      : <TrendingDown className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground font-bold uppercase">
                      <span>Sua loja</span>
                      <span className={cn("font-black", melhor ? "text-emerald-500" : "text-red-500")}>
                        {unidade === "R$" ? `R$ ${sua}` : `${sua}${unidade}`}
                      </span>
                    </div>
                    <Progress value={barPct} className="h-2" />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] text-muted-foreground font-black uppercase">Benchmark</div>
                    <div className="text-sm font-black">
                      {unidade === "R$" ? `R$ ${media}` : `${media}${unidade}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CVR Histórico vs Benchmark */}
      <div className="bg-card border border-border/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> CVR: Sua Loja vs. Benchmark — {nicho}
          </h3>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary inline-block" /> Sua loja</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-muted-foreground/40 inline-block" /> Benchmark</span>
          </div>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cvr_historico} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                formatter={(v: number, name: string) => [`${v}%`, name === "loja" ? "Sua loja" : "Benchmark"]}
              />
              <ReferenceLine y={bench.cvr_medio} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1.5} />
              <Bar dataKey="loja" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="loja" />
              <Bar dataKey="benchmark" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} name="benchmark" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Oportunidades */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-black font-syne tracking-tighter uppercase">
            Maiores Oportunidades vs. Benchmark
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOP_OPORTUNIDADES.map((op, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl p-6 space-y-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between">
                <Badge className="bg-red-500/10 text-red-500 border-none font-black text-[9px]">{op.gap} vs média</Badge>
                <Award className={cn("w-5 h-5", i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-amber-700")} />
              </div>
              <div>
                <h4 className="font-black text-sm">{op.area}</h4>
                <p className="text-emerald-500 font-black text-lg mt-1">{op.impacto}</p>
                <p className="text-xs text-muted-foreground mt-1">potencial mensal</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 text-[10px] font-black uppercase tracking-widest rounded-xl gap-2 hover:bg-primary hover:text-white hover:border-primary transition-all"
              >
                {op.acao} <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Data note */}
      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Benchmark calculado com base em dados anonimizados de <strong>200+ lojas brasileiras</strong> do segmento {nicho} ativas no LTV Boost. Atualizado mensalmente. Quanto mais lojas usam a plataforma, mais preciso e granular fica o benchmark.
        </p>
      </div>
    </div>
  );
}
