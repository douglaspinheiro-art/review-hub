import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles, AlertTriangle, Clock, Activity } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDiagnosticTelemetry } from "@/hooks/useDiagnosticTelemetry";
import { useActivationFunnel } from "@/hooks/useActivationFunnel";
import { Filter } from "lucide-react";

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export default function DiagnosticoTelemetria() {
  const [range, setRange] = useState<7 | 30>(30);
  const { data, isLoading, isError, refetch, isFetching } = useDiagnosticTelemetry(range);
  const { data: funnel, isLoading: funnelLoading } = useActivationFunnel(range);

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Voltar para Admin
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black font-syne tracking-tight">
                Telemetria de diagnósticos
              </h1>
              <p className="text-sm text-muted-foreground">
                Saúde da geração de diagnósticos a partir do evento{" "}
                <code className="text-xs bg-muted px-1 rounded">diagnostic_generated</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-1">
            {([7, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRange(d)}
                className={`text-xs font-bold px-3 py-1.5 rounded-md transition-colors ${
                  range === d
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando telemetria…
        </div>
      ) : isError || !data ? (
        <Card className="border-destructive/40">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Não foi possível carregar a telemetria. Tente novamente em instantes.
          </CardContent>
        </Card>
      ) : data.total === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-12 text-center space-y-2">
            <Activity className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Sem eventos <code className="text-xs bg-muted px-1 rounded">diagnostic_generated</code>{" "}
              nos últimos {range} dias.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Diagnósticos" value={String(data.total)} hint={`Últimos ${range} dias`} />
            <KpiCard
              label="Fallback"
              value={formatPct(data.fallbackPct)}
              hint={`${data.fallbackCount} de ${data.total}`}
              tone={data.fallbackPct > 20 ? "danger" : data.fallbackPct > 5 ? "warn" : "ok"}
            />
            <KpiCard
              label="Parse retry"
              value={formatPct(data.parseRetryPct)}
              hint={`${data.parseRetryCount} de ${data.total}`}
              tone={data.parseRetryPct > 15 ? "warn" : "ok"}
            />
            <KpiCard
              label="Tempo médio"
              value={`${(data.avgMs / 1000).toFixed(1)}s`}
              hint={`p95 ${(data.p95Ms / 1000).toFixed(1)}s`}
              icon={<Clock className="w-4 h-4" />}
            />
          </div>

          {/* Volume diário */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Volume diário</CardTitle>
              <CardDescription>Diagnósticos gerados por dia.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dailyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Completude */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Completude do payload</CardTitle>
                <CardDescription>Distribuição de payload_completeness_pct.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.completenessBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top enriched fields */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Campos enriquecidos mais frequentes</CardTitle>
                <CardDescription>Top 8 sinais opcionais que estão chegando.</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                {data.topEnrichedFields.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Sem campos enriquecidos no período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topEnrichedFields} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis
                        type="category"
                        dataKey="field"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        width={120}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabela */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Últimos 50 eventos</CardTitle>
              <CardDescription>Detalhe por geração.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="py-2 pr-4 font-medium">Quando</th>
                      <th className="py-2 pr-4 font-medium">Completude</th>
                      <th className="py-2 pr-4 font-medium">Tempo</th>
                      <th className="py-2 pr-4 font-medium">Fallback</th>
                      <th className="py-2 pr-4 font-medium">Parse retry</th>
                      <th className="py-2 pr-4 font-medium">Enriquecidos</th>
                      <th className="py-2 font-medium">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, 50).map((r) => {
                      const m = (r.metadata ?? {}) as Record<string, unknown>;
                      const completeness = typeof m.payload_completeness_pct === "number"
                        ? `${Math.round(m.payload_completeness_pct as number)}%`
                        : "—";
                      const ms = typeof m.total_ms === "number" ? `${m.total_ms}ms` : "—";
                      const fallback = m.fallback_mode === true;
                      const parseRetry = m.parse_retry === true;
                      const enrichedLen = Array.isArray(m.enriched_fields) ? (m.enriched_fields as unknown[]).length : 0;
                      const errMsg = typeof m.error_message === "string" ? (m.error_message as string) : null;
                      return (
                        <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="py-2.5 pr-4 text-muted-foreground text-xs">
                            {new Date(r.created_at).toLocaleString("pt-BR")}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{completeness}</td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{ms}</td>
                          <td className="py-2.5 pr-4">
                            {fallback ? (
                              <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="w-3 h-3 mr-1" />sim
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">não</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4">
                            {parseRetry ? (
                              <Badge variant="outline" className="text-[9px]">sim</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">não</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{enrichedLen}</td>
                          <td className="py-2.5 text-xs text-destructive max-w-[260px] truncate" title={errMsg ?? undefined}>
                            {errMsg ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
      ? "text-amber-500"
      : tone === "ok"
      ? "text-emerald-500"
      : "text-foreground";
  return (
    <Card className="border-border/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <p className={`text-2xl font-black font-mono mt-2 ${toneClass}`}>{value}</p>
        {hint ? <p className="text-[10px] text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}