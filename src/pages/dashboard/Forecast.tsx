import {
  TrendingUp, Sparkles, ArrowUpRight, Info, ShieldCheck, Loader2, RefreshCw, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAnalytics, useForecastSnapshot, useForecastProjection } from "@/hooks/useDashboard";
import { useLoja } from "@/hooks/useConvertIQ";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  FORECAST_ANALYTICS_DAYS,
  FORECAST_MIN_DAYS,
  buildForecastProjection,
  formatForecastYAxisBrl,
} from "@/lib/forecast-projection";

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function Forecast() {
  const navigate = useNavigate();
  const loja = useLoja();
  const storeId = loja.data?.id ?? null;

  const {
    data: analytics,
    isLoading: loadingAnalytics,
    isFetching: fetchingAnalytics,
    isError: analyticsError,
    error: analyticsErr,
    refetch: refetchAnalytics,
  } = useAnalytics(FORECAST_ANALYTICS_DAYS);
  const {
    data: snapshot,
    isLoading: loadingSnapshot,
    isFetching: fetchingSnapshot,
    isError: snapshotError,
    error: snapshotErr,
    refetch: refetchSnapshot,
  } = useForecastSnapshot(storeId);

  const {
    data: projectionData,
    isLoading: loadingProjection,
    isError: projectionRpcError,
    refetch: refetchProjection,
  } = useForecastProjection(storeId, FORECAST_ANALYTICS_DAYS);

  const rows = analytics?.rows;
  const projection = useMemo(() => buildForecastProjection(rows ?? []), [rows]);
  const { chartBuckets, realizedWindowTotal } = projection;

  // Prefer server-side projection data, fallback to client calculation
  const projected30 = projectionData?.projected_30 ?? projection.projected30;
  const trendPct = projectionData?.trend_pct ?? projection.trendPct;
  const avgDaily = projectionData?.avg_daily ?? projection.avgDaily;

  const analyticsReady = !loadingAnalytics && !analyticsError;
  const lojaReady = !loja.isLoading;
  const rowCount = rows?.length ?? 0;
  const showSkeleton = (!lojaReady || (loadingAnalytics && rowCount === 0) || loadingProjection) && !analyticsError;

  const refetchAll = () => {
    void refetchAnalytics();
    void refetchSnapshot();
    void refetchProjection();
  };

  if (showSkeleton) {
    return (
      <div className="space-y-8 pb-10 max-w-5xl">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-[350px] md:col-span-2 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (analyticsError) {
    return (
      <div className="space-y-6 max-w-2xl pb-10">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Previsão de receita</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Não foi possível carregar o histórico de receita atribuída às campanhas.
          </p>
        </div>
        <Card className="p-6 border-destructive/30 bg-destructive/5">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-3">
              <p className="text-sm font-medium text-destructive">
                {analyticsErr instanceof Error ? analyticsErr.message : "Erro ao consultar os dados."}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetchAnalytics()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (analyticsReady && rowCount < FORECAST_MIN_DAYS) {
    const missing = Math.max(0, FORECAST_MIN_DAYS - rowCount);
    return (
      <div className="space-y-6 max-w-2xl pb-10">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Previsão de receita</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Previsão a partir da receita atribuída ao LTV Boost no relatório diário de analytics.
          </p>
        </div>
        <Card className="p-8 border-dashed">
          <p className="text-sm text-muted-foreground mb-4">
            Para uma estimativa mais estável, precisamos de pelo menos <strong>{FORECAST_MIN_DAYS} dias</strong> com
            dados no período. No momento há <strong>{rowCount}</strong> dia(s) — faltam <strong>{missing}</strong>{" "}
            para liberar o gráfico e a projeção de 30 dias.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={() => navigate("/dashboard/campanhas")}>Campanhas</Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/analytics")}>Analytics</Button>
            <Button variant="ghost" size="sm" onClick={() => void refetchAnalytics()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const snapshotBase = snapshot?.cenario_base != null ? Number(snapshot.cenario_base) : null;
  const snapshotPresc = snapshot?.cenario_com_prescricoes != null ? Number(snapshot.cenario_com_prescricoes) : null;
  const snapshotUx = snapshot?.cenario_com_ux != null ? Number(snapshot.cenario_com_ux) : null;
  const snapshotConf = snapshot?.confianca_ia != null ? Math.round(Number(snapshot.confianca_ia)) : null;
  const hasPersistedScenarios = snapshot && (snapshotBase != null || snapshotPresc != null);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Previsão de receita</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Indicadores a partir do histórico de receita atribuída (últimos {FORECAST_ANALYTICS_DAYS} dias). Não
            substitui um modelo financeiro formal.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void refetchAll()}>
          <RefreshCw className={cn("w-4 h-4 mr-2", (fetchingAnalytics || fetchingSnapshot) && "animate-spin")} />
          Atualizar dados
        </Button>
      </div>

      {projectionRpcError && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-950 dark:text-sky-100">
          <Badge variant="outline" className="border-sky-500/50 text-[10px] font-bold uppercase">
            Estimativa local
          </Badge>
          <span>
            A projeção estatística no servidor não respondeu; os valores &quot;Próximos 30 dias&quot; usam só o cálculo no app.
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetchProjection()}>
            Tentar RPC
          </Button>
        </div>
      )}

      {snapshotError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <span>
              Cenários salvos não puderam ser carregados:{" "}
              {snapshotErr instanceof Error ? snapshotErr.message : "erro desconhecido"}. A estimativa rápida abaixo
              continua válida.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetchSnapshot()}>
              Tentar cenários de novo
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-muted/50 border rounded-xl p-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          O gráfico mostra a receita atribuída agrupada por trechos do período. O valor <strong>Próximos 30 dias</strong>{" "}
          ao lado usa a média diária dessa janela com um ajuste leve pela tendência entre a primeira e a segunda metade —
          é uma estimativa indicativa, exibida só no cartão (não prolonga a linha do gráfico).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-card border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Receita atribuída no período
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40" /> Soma por trecho (~{FORECAST_ANALYTICS_DAYS} dias)
            </div>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartBuckets}>
                <defs>
                  <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: "bold" }}
                  tickFormatter={(v) => formatForecastYAxisBrl(Number(v))}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "12px", border: "1px solid hsl(var(--border))" }}
                  itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                  formatter={(value: number) => (value != null && value > 0 ? fmtBrl(value) : "—")}
                />
                <Area
                  type="monotone"
                  dataKey="realizado"
                  name="Receita atribuída"
                  stroke="#888888"
                  fillOpacity={1}
                  fill="url(#colorReal)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-primary/20 bg-primary/5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Sparkles className="w-12 h-12" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">Estimativa rápida · 30 dias</h3>
            <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
              Calculada no app a partir do mesmo histórico do gráfico (média diária + tendência amortecida). Diferente
              de cenários gerados por job ou modelo externo, quando existirem.
            </p>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground block">Receita atribuída projetada</span>
                <span className="text-3xl font-black font-syne tracking-tighter">{fmtBrl(projected30)}</span>
              </div>
              <div className={cn("font-bold text-sm flex items-center gap-2", trendPct >= 0 ? "text-emerald-500" : "text-amber-600")}>
                <ArrowUpRight className={cn("w-4 h-4", trendPct < 0 && "rotate-90")} />
                Tendência entre metades do período: {trendPct >= 0 ? "+" : ""}{trendPct.toFixed(1)}%
              </div>
              <div className="pt-4 border-t border-primary/10 text-[10px] text-muted-foreground leading-relaxed">
                Média diária na janela: <span className="text-foreground font-bold">{fmtBrl(avgDaily)}</span>
                {" · "}
                Total no período: <span className="text-foreground font-bold">{fmtBrl(realizedWindowTotal)}</span>
              </div>
            </div>
          </Card>

          {hasPersistedScenarios && (
            <div className="bg-card border rounded-2xl p-6">
              <h3 className="font-bold text-sm uppercase tracking-tighter text-muted-foreground mb-1">
                Cenários do último processamento
              </h3>
              <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                Valores persistidos pelo pipeline da plataforma (ex.: rotina agendada). Podem usar outra metodologia
                em relação à estimativa rápida ao lado.
                {snapshot.data_calculo ? ` · Calculado em ${new Date(snapshot.data_calculo).toLocaleString("pt-BR")}` : ""}
              </p>
              <ul className="space-y-2 text-xs">
                {snapshotBase != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Cenário base</span><span className="font-bold">{fmtBrl(snapshotBase)}</span></li>
                )}
                {snapshotPresc != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Com prescrições</span><span className="font-bold">{fmtBrl(snapshotPresc)}</span></li>
                )}
                {snapshotUx != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Com melhorias de UX</span><span className="font-bold">{fmtBrl(snapshotUx)}</span></li>
                )}
                {snapshotConf != null && (
                  <li className="flex justify-between gap-2"><span className="text-muted-foreground">Confiança do modelo (%)</span><span className="font-bold">{snapshotConf}</span></li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-bold text-base mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Como interpretamos os números
          </h3>
          <ul className="space-y-3">
            {[
              "Fonte: receita atribuída ao LTV Boost no fechamento diário de analytics",
              `Janela: até ${FORECAST_ANALYTICS_DAYS} dias, conforme dias com registro`,
              "Estimativa de 30 dias: média diária × 30, com ajuste limitado (±25%) pela tendência entre metades do período",
              hasPersistedScenarios
                ? "Cenários ao lado: último resultado salvo pelo processamento automático para esta loja"
                : "Sem cenário salvo pelo processamento automático — só a estimativa rápida acima",
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
            Não comparamos com outras lojas nem aplicamos sazonalidade nesta tela. Para análises mais profundas, use a
            exportação dos relatórios ou integrações de dados da sua equipe.
          </p>
        </div>
      </div>
    </div>
  );
}
