import { useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Send, Eye, DollarSign, Users, RefreshCw, BarChart3 } from "lucide-react";
import { useAnalytics, useConversionBaseline } from "@/hooks/useDashboard";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WHATSAPP_CAMPAIGN_BENCHMARKS_BR } from "@/lib/industry-benchmarks";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const PERIODS = [
  { label: "7 dias", value: 7 as const },
  { label: "30 dias", value: 30 as const },
  { label: "90 dias", value: 90 as const },
];

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card border rounded-xl p-4 space-y-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[260px] w-full rounded-lg" />
      </div>
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-[220px] w-full rounded-lg" />
      </div>
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <Skeleton className="h-5 w-64" />
        <div className="grid sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
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

export default function Analytics() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const { loading: authLoading } = useAuth();
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useAnalytics(period);
  const {
    data: baseline,
    isFetching: isBaselineFetching,
    isLoading: isBaselineLoading,
    error: baselineError,
    refetch: refetchBaseline,
  } = useConversionBaseline(period);

  const showSkeleton = authLoading || isLoading;
  const refreshing = isFetching || isBaselineFetching;

  const kpis = data ? [
    {
      label: "Mensagens Enviadas",
      value: data.totals.messagesSent.toLocaleString("pt-BR"),
      icon: Send,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Taxa de Entrega",
      value: `${data.deliveryRate}%`,
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Taxa de Leitura",
      value: `${data.readRate}%`,
      icon: Eye,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "Receita Influenciada",
      value: data.totals.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Novos Contatos",
      value: data.totals.newContacts.toLocaleString("pt-BR"),
      icon: Users,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ] : [];

  const handleRefresh = () => {
    void refetch();
    void refetchBaseline();
  };

  const hasRows = Boolean(data && data.rows.length > 0);

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
            disabled={showSkeleton || Boolean(error)}
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

      {showSkeleton && <AnalyticsSkeleton />}

      {error && !showSkeleton && (
        <div className="text-center py-12 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4">
          <p className="text-muted-foreground text-sm">Erro ao carregar analytics.</p>
          {import.meta.env.DEV && error instanceof Error && (
            <p className="text-xs text-muted-foreground font-mono break-all">{error.message}</p>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!showSkeleton && !error && data && !hasRows && (
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

      {!showSkeleton && !error && data && hasRows && (
        <>
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

          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Mensagens — últimos {period} dias</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEnviadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEntregues" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" minTickGap={28} />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend />
                <Area type="monotone" dataKey="enviadas" name="Enviadas" stroke="#6366f1" fill="url(#colorEnviadas)" strokeWidth={2} />
                <Area type="monotone" dataKey="entregues" name="Entregues" stroke="#0ea5e9" fill="url(#colorEntregues)" strokeWidth={2} />
                <Area type="monotone" dataKey="lidas" name="Lidas" stroke="#10b981" fill="url(#colorLidas)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Receita influenciada — últimos {period} dias</h2>
            <p className="text-xs text-muted-foreground">Um ponto por dia no período selecionado.</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" minTickGap={28} />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
