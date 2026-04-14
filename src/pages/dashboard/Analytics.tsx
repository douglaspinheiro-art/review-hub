import { useMemo, useState, Component } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Send, Eye, DollarSign, Users, RefreshCw, BarChart3, AlertCircle } from "lucide-react";
import { useAnalyticsSuperBundle } from "@/hooks/useDashboard";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
// ... (rest of imports)
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WHATSAPP_CAMPAIGN_BENCHMARKS_BR } from "@/lib/industry-benchmarks";
import { cn } from "@/lib/utils";
import { CHART_SERIES_MAX_POINTS, downsampleDailySeriesBySum } from "@/lib/chart-downsample";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Lightweight error boundary for individual charts — prevents one bad data point
// from crashing the entire Analytics page.
class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Dados indisponíveis
        </div>
      );
    }
    return this.props.children;
  }
}

const PERIODS = [
  { label: "7 dias", value: 7 as const },
  { label: "30 dias", value: 30 as const },
  { label: "90 dias", value: 90 as const },
];

type SnapshotChartPoint = {
  dateKey: string;
  label: string;
  messages_sent: number;
  messages_delivered: number;
  messages_read: number;
  revenue_influenced: number;
};

function parseSnapshotChartSeries(raw: unknown): SnapshotChartPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: SnapshotChartPoint[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const dateRaw = o.date;
    if (dateRaw == null) continue;
    const dateKey = String(dateRaw);
    const d = new Date(`${dateKey}T12:00:00`);
    const label = Number.isFinite(d.getTime())
      ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
      : dateKey;
    out.push({
      dateKey,
      label,
      messages_sent: Number(o.messages_sent ?? 0),
      messages_delivered: Number(o.messages_delivered ?? 0),
      messages_read: Number(o.messages_read ?? 0),
      revenue_influenced: Number(o.revenue_influenced ?? 0),
    });
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function BenchmarkBar({
  label,
  yours,
  sector,
  unit,
  yoursLabel,
}: {
  label: string;
  yours: number;
  sector: number;
  unit: string;
  yoursLabel?: string;
}) {
  const yoursRounded = Math.round(yours * 10) / 10;
  const diff = yoursRounded - sector;
  const isAbove = diff >= 0;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      {yoursLabel && (
        <p className="text-[11px] text-muted-foreground leading-snug">{yoursLabel}</p>
      )}
      <div className="flex items-end gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Você</span>
            <span className="font-semibold tabular-nums">{yoursRounded}{unit}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full max-w-full"
              style={{ width: `${Math.min(Math.max(yoursRounded, 0), 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Referência setorial</span>
            <span className="text-muted-foreground tabular-nums">{sector}{unit}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-muted-foreground/40 rounded-full max-w-full"
              style={{ width: `${Math.min(sector, 100)}%` }}
            />
          </div>
        </div>
      </div>
      <p className={cn("text-xs font-medium", isAbove ? "text-green-600" : "text-orange-600")}>
        {isAbove ? "▲" : "▼"} {Math.abs(Math.round(diff * 10) / 10)}{unit}{" "}
        {isAbove ? "acima" : "abaixo"} da referência
      </p>
    </div>
  );
}

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function Analytics() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const { loading: authLoading } = useAuth();

  const {
    data: bundle,
    isLoading: bundleLoading,
    isFetching: bundleFetching,
    isError: bundleIsError,
    error: bundleError,
    refetch: refetchBundle,
  } = useAnalyticsSuperBundle(period);

  const isBaselineLoading = bundleLoading;
  const baselineError = bundleIsError;

  const snapshot = bundle?.snapshot;
  const baselineRaw = bundle?.baseline;

  const baseline = useMemo(() => {
    if (!baselineRaw) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (baselineRaw ?? {}) as Record<string, any>;
    const sent = Number(row.sent ?? 0);
    const replied = Number(row.replied ?? 0);
    const delivered = Number(row.delivered ?? 0);
    const read = Number(row.read ?? 0);
    const conversions = Number(row.conversions ?? 0);
    const revenue = Number(row.revenue ?? 0);
    const prevSent = Number(row.prev_sent ?? 0);
    const prevReply = Number(row.prev_replied ?? 0);
    const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const readRate = sent > 0 ? (read / sent) * 100 : 0;
    const conversionRate = sent > 0 ? (conversions / sent) * 100 : 0;
    const revenuePerMessage = sent > 0 ? revenue / sent : 0;
    const prevReplyRate = prevSent > 0 ? (prevReply / prevSent) * 100 : 0;
    const replyRateDelta = prevReplyRate > 0 ? ((replyRate - prevReplyRate) / prevReplyRate) * 100 : 0;
    const tracked = Number(row.sla_tracked ?? 0);
    const breached = Number(row.sla_breached ?? 0);
    const slaCompliance = tracked > 0 ? ((tracked - breached) / tracked) * 100 : 100;
    const priorityMix = {
      urgent: Number(row.priority_urgent ?? 0),
      high: Number(row.priority_high ?? 0),
      normal: Number(row.priority_normal ?? 0),
      low: Number(row.priority_low ?? 0),
    };
    return {
      sent,
      replied,
      delivered,
      read,
      conversions,
      revenue,
      replyRate,
      conversionRate,
      deliveryRate,
      readRate,
      revenuePerMessage,
      replyRateDelta,
      sla: {
        totalTracked: tracked,
        breached,
        compliance: slaCompliance,
      },
      priorityMix,
    };
  }, [baselineRaw]);

  const chartSeries = useMemo(() => {
    const parsed = parseSnapshotChartSeries(snapshot?.chart_series);
    return downsampleDailySeriesBySum(
      parsed,
      ["messages_sent", "messages_delivered", "messages_read", "revenue_influenced"],
      CHART_SERIES_MAX_POINTS,
    );
  }, [snapshot?.chart_series]);

  const showSkeleton = authLoading || bundleLoading;
  const refreshing = bundleFetching;
  const snapshotError = bundleIsError;
  const snapshotErrorMessage =
    bundleError instanceof Error ? bundleError.message : "Não foi possível carregar as métricas.";

  const kpis = snapshot
    ? [
        {
          label: "Mensagens Enviadas",
          value: snapshot.analytics.total_sent.toLocaleString("pt-BR"),
          icon: Send,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
        },
        {
          label: "Taxa de Entrega",
          value: `${Math.round((snapshot.analytics.total_delivered / Math.max(1, snapshot.analytics.total_sent)) * 100)}%`,
          icon: TrendingUp,
          color: "text-green-500",
          bg: "bg-green-500/10",
        },
        {
          label: "Taxa de Leitura",
          value: `${Math.round((snapshot.analytics.total_read / Math.max(1, snapshot.analytics.total_delivered)) * 100)}%`,
          icon: Eye,
          color: "text-purple-500",
          bg: "bg-purple-500/10",
        },
        {
          label: "Receita Influenciada",
          value: snapshot.analytics.total_revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          icon: DollarSign,
          color: "text-emerald-500",
          bg: "bg-emerald-500/10",
        },
        {
          label: "Novos Contatos",
          value: snapshot.analytics.total_new_contacts.toLocaleString("pt-BR"),
          icon: Users,
          color: "text-orange-500",
          bg: "bg-orange-500/10",
        },
      ]
    : [];

  const handleRefresh = () => {
    void refetchBundle();
  };

  const hasRows = Boolean(snapshot && snapshot.analytics.total_sent > 0);
  const hasChartSeries = chartSeries.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Métricas e desempenho das suas campanhas</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefresh}
            disabled={showSkeleton}
            aria-busy={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            Atualizar
          </Button>
          <ToggleGroup
            type="single"
            value={String(period)}
            onValueChange={(v) => {
              if (v === "7" || v === "30" || v === "90") setPeriod(Number(v) as 7 | 30 | 90);
            }}
            className="justify-end bg-muted/50 p-1 rounded-lg"
            aria-label="Período dos gráficos"
            disabled={showSkeleton}
          >
            {PERIODS.map((p) => (
              <ToggleGroupItem
                key={p.value}
                value={String(p.value)}
                className="text-xs px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {!showSkeleton && snapshotError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar o painel</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
            <span className="text-sm">{snapshotErrorMessage}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void refetchBundle()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showSkeleton ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !snapshotError ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpis.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border rounded-xl p-4 space-y-2">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} aria-hidden />
              </div>
              <p className="text-xl font-bold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!showSkeleton && !snapshotError && snapshot && !hasRows && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-xl border bg-card space-y-4">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <BarChart3 className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-1 max-w-md">
            <h2 className="font-semibold text-lg">Ainda não há dados neste período</h2>
            <p className="text-sm text-muted-foreground">
              Quando você enviar campanhas e o sistema registrar métricas diárias, os gráficos aparecem aqui automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button asChild>
              <Link to="/dashboard/campanhas">Criar campanha</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard/whatsapp">Conectar WhatsApp</Link>
            </Button>
          </div>
        </div>
      )}

      {!showSkeleton && !snapshotError && snapshot && hasRows && (
        <>
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Mensagens — últimos {period} dias</h2>
            <p className="text-xs text-muted-foreground">Série diária a partir de analytics da loja (mesma base do snapshot).</p>
            {hasChartSeries ? (
              <div className="h-[260px] w-full">
                <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="messages_sent" name="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="messages_delivered" name="Entregues" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="messages_read" name="Lidas" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
            ) : (
              <div className="h-[200px] w-full rounded-lg border border-dashed flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                Série diária indisponível. Atualize o app Supabase (função{" "}
                <code className="text-[10px] bg-muted px-1 rounded">get_dashboard_snapshot</code> com{" "}
                <code className="text-[10px] bg-muted px-1 rounded">chart_series</code>) ou aguarde o próximo deploy das migrações.
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Receita influenciada — últimos {period} dias</h2>
            <p className="text-xs text-muted-foreground">Um ponto por dia no período selecionado.</p>
            {hasChartSeries ? (
              <div className="h-[220px] w-full">
                <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsRevFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => fmtBrl(Number(v))}
                    />
                    <Tooltip
                      formatter={(v: number) => fmtBrl(v)}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue_influenced"
                      name="Receita"
                      stroke="hsl(var(--primary))"
                      fill="url(#analyticsRevFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
            ) : (
              <div className="h-[180px] w-full rounded-lg border border-dashed flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                Mesma condição da série de mensagens acima.
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="font-semibold">Comparativo com referência setorial</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full w-fit">
                Moda e vestuário · Brasil
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Leitura, resposta e conversão vêm dos seus envios rastreados e dos pedidos atribuídos às mensagens no mesmo período dos gráficos. Os percentuais de referência são agregados internamente (alinhados ao relatório semanal por WhatsApp).
            </p>
            {baselineError && (
              <p className="text-sm text-destructive">Não foi possível carregar o comparativo de envios.</p>
            )}
            {isBaselineLoading && !baseline && (
              <div className="grid sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-lg" />
                ))}
              </div>
            )}
            {baseline && (
              <div className="grid sm:grid-cols-3 gap-4">
                <BenchmarkBar
                  label="Leitura (lidas / enviadas)"
                  yours={baseline.readRate}
                  sector={WHATSAPP_CAMPAIGN_BENCHMARKS_BR.readOnSentPct}
                  unit="%"
                  yoursLabel={
                    baseline.sent < 1
                      ? "Sem envios rastreados no período; valor exibido como 0%."
                      : `Com base em ${baseline.sent.toLocaleString("pt-BR")} envios.`
                  }
                />
                <BenchmarkBar
                  label="Resposta (respostas / enviadas)"
                  yours={baseline.replyRate}
                  sector={WHATSAPP_CAMPAIGN_BENCHMARKS_BR.replyOnSentPct}
                  unit="%"
                  yoursLabel={
                    baseline.sent < 1
                      ? "Sem envios rastreados no período."
                      : undefined
                  }
                />
                <BenchmarkBar
                  label="Conversão atribuída (pedidos / enviadas)"
                  yours={baseline.conversionRate}
                  sector={WHATSAPP_CAMPAIGN_BENCHMARKS_BR.attributedOrderOnSentPct}
                  unit="%"
                  yoursLabel={
                    baseline.sent < 1
                      ? "Sem envios rastreados no período."
                      : `${baseline.conversions.toLocaleString("pt-BR")} pedido(s) atribuído(s).`
                  }
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
