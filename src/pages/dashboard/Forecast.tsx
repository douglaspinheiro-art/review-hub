import { useMemo } from "react";
import {
  TrendingUp, Sparkles, ArrowUpRight, Info, ShieldCheck, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useAnalytics, useForecastSnapshot } from "@/hooks/useDashboard";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function bucketRevenueRows(
  rows: { date: string; revenue_influenced: unknown }[],
  numBuckets: number,
): { name: string; realizado: number | null; estimativa: number | null }[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const size = Math.max(1, Math.ceil(sorted.length / numBuckets));
  const out: { name: string; realizado: number | null; estimativa: number | null }[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const slice = sorted.slice(i * size, (i + 1) * size);
    if (slice.length === 0) break;
    const sum = slice.reduce((s, r) => s + Number(r.revenue_influenced ?? 0), 0);
    const d0 = slice[0].date;
    const name = new Date(d0).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    out.push({ name, realizado: sum, estimativa: null });
  }
  return out;
}

export default function Forecast() {
  const navigate = useNavigate();
  const { data: analytics, isLoading: loadingAnalytics } = useAnalytics(120);
  const { data: snapshot, isLoading: loadingSnapshot } = useForecastSnapshot();
  const rows = analytics?.rows ?? [];

  const {
    chartData,
    projected30,
    trendPct,
    avgDaily,
    realizedWindowTotal,
  } = useMemo(() => {
    if (rows.length === 0) {
      return {
        chartData: [] as { name: string; realizado: number | null; estimativa: number | null }[],
        projected30: 0,
        trendPct: 0,
        avgDaily: 0,
        realizedWindowTotal: 0,
      };
    }
    const total = rows.reduce((s, x) => s + Number(x.revenue_influenced), 0);
    const days = rows.length;
    const avgDailyVal = total / days;
    const mid = Math.floor(rows.length / 2);
    const prevHalf = rows.slice(0, mid).reduce((s, x) => s + Number(x.revenue_influenced), 0);
    const recentHalf = rows.slice(mid).reduce((s, x) => s + Number(x.revenue_influenced), 0);
    const growth = prevHalf > 0 ? ((recentHalf - prevHalf) / prevHalf) * 100 : 0;
    const damped = Math.min(25, Math.max(-25, growth * 0.35));
    const projected = avgDailyVal * 30 * (1 + damped / 100);
    const nBuckets = Math.min(8, Math.max(4, Math.ceil(days / 14)));
    const buckets = bucketRevenueRows(rows as { date: string; revenue_influenced: unknown }[], nBuckets);
    const chart = [...buckets, { name: "Estim. 30d", realizado: null, estimativa: Math.max(0, projected) }];
    return {
      chartData: chart,
      projected30: Math.max(0, projected),
      trendPct: growth,
      avgDaily: avgDailyVal,
      realizedWindowTotal: total,
    };
  }, [rows]);

  const loading = loadingAnalytics || loadingSnapshot;

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length < 3) {
    return (
      <div className="space-y-6 max-w-2xl pb-10">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Revenue Forecast</h1>
          <p className="text-muted-foreground text-sm mt-1">Previsão a partir da receita influenciada registrada no analytics diário.</p>
        </div>
        <Card className="p-8 border-dashed">
          <p className="text-sm text-muted-foreground mb-4">
            Ainda não há histórico suficiente em <strong>analytics_daily</strong> (mínimo de poucos dias com receita). Assim que campanhas e atribuição começarem a preencher os dados, o gráfico e a estimativa de 30 dias aparecem aqui automaticamente.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={() => navigate("/dashboard/campanhas")}>Campanhas</Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/analytics")}>Analytics</Button>
          </div>
        </Card>
      </div>
    );
  }

  const snapshotBase = snapshot?.cenario_base != null ? Number(snapshot.cenario_base) : null;
  const snapshotPresc = snapshot?.cenario_com_prescricoes != null ? Number(snapshot.cenario_com_prescricoes) : null;
  const snapshotUx = snapshot?.cenario_com_ux != null ? Number(snapshot.cenario_com_ux) : null;
  const snapshotConf = snapshot?.confianca_ia != null ? Math.round(Number(snapshot.confianca_ia)) : null;

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Revenue Forecast</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Projeção simples a partir do histórico de receita influenciada (últimos ~120 dias). Não substitui modelo financeiro formal.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-muted/50 border rounded-xl p-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          A linha tracejada <strong>Estim. 30d</strong> usa média diária da janela atual com um ajuste leve pela tendência entre a primeira e a segunda metade do período. Valores são indicativos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-card border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Receita influenciada e estimativa
            </h3>
            <div className="flex gap-4 flex-wrap justify-end">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40" /> Realizado (período)
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-primary">
                <div className="w-2 h-2 rounded-full bg-primary" /> Estim. 30 dias
              </div>
            </div>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} tickFormatter={(v) => `R$ ${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "12px", border: "1px solid hsl(var(--border))" }}
                  itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                  formatter={(value: number) => (value != null && value > 0 ? fmtBrl(value) : "—")}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="realizado" name="Realizado" stroke="#888888" fillOpacity={1} fill="url(#colorReal)" strokeWidth={2} connectNulls />
                <Area type="monotone" dataKey="estimativa" name="Estim. 30d" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorEst)" strokeWidth={2} strokeDasharray="6 4" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-primary/20 bg-primary/5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-12 h-12" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">Próximos 30 dias (estimativa)</h3>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground block">Receita influenciada projetada</span>
                <span className="text-3xl font-black font-syne tracking-tighter">{fmtBrl(projected30)}</span>
              </div>
              <div className={cn("font-bold text-sm flex items-center gap-2", trendPct >= 0 ? "text-emerald-500" : "text-amber-600")}>
                <ArrowUpRight className={cn("w-4 h-4", trendPct < 0 && "rotate-90")} />
                Tendência entre metades do período: {trendPct >= 0 ? "+" : ""}{trendPct.toFixed(1)}%
              </div>
              <div className="pt-4 border-t border-primary/10 text-[10px] text-muted-foreground leading-relaxed">
                Média diária na janela: <span className="text-foreground font-bold">{fmtBrl(avgDaily)}</span>
                {" · "}
                Soma realizada: <span className="text-foreground font-bold">{fmtBrl(realizedWindowTotal)}</span>
              </div>
            </div>
          </Card>

          {snapshot && (snapshotBase != null || snapshotPresc != null) && (
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-bold text-sm uppercase tracking-tighter text-muted-foreground mb-4">Snapshot (backend)</h3>
              <p className="text-[10px] text-muted-foreground mb-3">
                Último registro em forecast_snapshots
                {snapshot.data_calculo ? ` · ${new Date(snapshot.data_calculo).toLocaleString("pt-BR")}` : ""}
              </p>
              <ul className="space-y-2 text-xs">
                {snapshotBase != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Cenário base</span><span className="font-bold">{fmtBrl(snapshotBase)}</span></li>
                )}
                {snapshotPresc != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Com prescrições</span><span className="font-bold">{fmtBrl(snapshotPresc)}</span></li>
                )}
                {snapshotUx != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Com UX</span><span className="font-bold">{fmtBrl(snapshotUx)}</span></li>
                )}
                {snapshotConf != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Confiança IA (%)</span><span className="font-bold">{snapshotConf}</span></li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-bold text-base mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Base de cálculo (transparente)
          </h3>
          <ul className="space-y-3">
            {[
              "Fonte: tabela analytics_daily, campo revenue_influenced",
              "Janela: até ~120 dias, conforme registros disponíveis",
              "Estimativa 30d: média diária × 30 com ajuste limitado pela tendência",
              snapshot ? "Cenários extras: última linha de forecast_snapshots para esta loja" : "Sem snapshot persistido — apenas projeção local acima",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-muted/30 border border-dashed rounded-2xl p-6 flex flex-col justify-center text-center">
          <h4 className="font-bold text-sm mb-1">Limitações</h4>
          <p className="text-[10px] text-muted-foreground max-w-md mx-auto leading-relaxed">
            Não há benchmark com outras lojas nem previsão de sazonalidade nesta tela. Para cenários avançados, use dados exportados ou integre forecast_snapshots via jobs no Supabase.
          </p>
        </div>
      </div>
    </div>
  );
}
