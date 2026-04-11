import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Award,
  BarChart3,
  Sparkles,
  Info,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  useLoja,
  useFunilPageMetricas,
  useDiagnosticos,
  useSectorBenchmark,
  isFunilGa4SnapshotRecent,
} from "@/hooks/useConvertIQ";
import type { Database } from "@/lib/database.types";
import {
  BENCHMARK_NICHE_KEYS,
  mergeSectorIntoStatic,
  mapStoreSegmentToUiNiche,
  safePctDiff,
  type BenchmarkNicheKey,
} from "@/lib/benchmark-niches";
import { shouldHideNavItemHref } from "@/lib/beta-scope";

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

type Periodo = "7d" | "30d" | "90d";

function funilSourceLabel(source: "ga4" | "manual" | "none"): string {
  if (source === "ga4") return "GA4 (funil diário)";
  if (source === "manual") return "Métricas manuais";
  return "Sem dados de funil";
}

export default function BenchmarkScore() {
  const [nicho, setNicho] = useState<BenchmarkNicheKey>("Moda");
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  const loja = useLoja();
  const funilPage = useFunilPageMetricas(loja.data?.id ?? null, periodo);
  const diags = useDiagnosticos(loja.data?.id ?? null);
  const sectorQ = useSectorBenchmark(nicho);

  useEffect(() => {
    if (!loja.data?.segment) return;
    setNicho(mapStoreSegmentToUiNiche(loja.data.segment));
  }, [loja.data?.segment]);

  const bench = useMemo(
    () => mergeSectorIntoStatic(nicho, sectorQ.data ?? undefined),
    [nicho, sectorQ.data],
  );

  const mrow = funilPage.data?.metricas;
  const hasFunnelData = mrow != null;
  const visitas = hasFunnelData ? Number(mrow.visitantes ?? 0) : 0;
  const compras = hasFunnelData ? Number(mrow.compras ?? 0) : 0;
  const receita = hasFunnelData ? Number(mrow.receita ?? 0) : 0;
  const cvr =
    visitas > 0 ? Number(((compras / visitas) * 100).toFixed(1)) : hasFunnelData ? 0 : null;
  const ticket =
    compras > 0
      ? Number((receita / compras).toFixed(0))
      : Number((loja.data as StoreRow & { ticket_medio?: number })?.ticket_medio ?? 0);

  const cvrForScore = cvr ?? 0;
  const ticketForScore = ticket > 0 ? ticket : STATIC_TICKET_FALLBACK(loja.data);

  const cvrScore = Math.max(
    1,
    Math.min(99, Math.round((cvrForScore / Math.max(bench.cvr_medio, 0.1)) * 50)),
  );
  const ticketScore = Math.max(
    1,
    Math.min(99, Math.round((ticketForScore / Math.max(bench.ticket_medio, 1)) * 50)),
  );
  const scoreRelativo = Math.round((cvrScore + ticketScore) / 2);

  const cvrHistoricoFromDiags = (diags.data ?? []).slice(0, 6).reverse().map((d) => ({
    mes: new Date(d.created_at ?? "").toLocaleDateString("pt-BR", {
      month: "short",
      day: "2-digit",
    }),
    loja: Number(d.taxa_conversao ?? 0),
    benchmark: bench.cvr_medio,
  }));

  const historicoFallback = useMemo(() => {
    const base = cvr ?? 0;
    return [
      { mes: "Out", loja: Math.max(0.3, base - 0.5), benchmark: bench.cvr_medio },
      { mes: "Nov", loja: Math.max(0.3, base - 0.4), benchmark: bench.cvr_medio },
      { mes: "Dez", loja: Math.max(0.3, base - 0.2), benchmark: bench.cvr_medio },
      { mes: "Jan", loja: Math.max(0.3, base - 0.1), benchmark: bench.cvr_medio },
      { mes: "Fev", loja: Math.max(0.3, base), benchmark: bench.cvr_medio },
      { mes: "Mar", loja: Math.max(0.3, base), benchmark: bench.cvr_medio },
    ];
  }, [bench.cvr_medio, cvr]);

  const chartData =
    cvrHistoricoFromDiags.length > 0 ? cvrHistoricoFromDiags : historicoFallback;
  const chartIsFromDiagnostics = cvrHistoricoFromDiags.length > 0;

  const metricasComparativo = [
    { label: "CVR", sua: cvrForScore, media: bench.cvr_medio, unidade: "%" as const, maior_melhor: true },
    {
      label: "Ticket médio",
      sua: ticketForScore,
      media: bench.ticket_medio,
      unidade: "R$" as const,
      maior_melhor: true,
    },
  ];

  const automacoesHidden = shouldHideNavItemHref("/dashboard/automacoes");
  const campanhasHidden = shouldHideNavItemHref("/dashboard/campanhas");

  const oportunidades = useMemo(() => {
    const rows: Array<{
      area: string;
      gap: string;
      impacto: string;
      cta: string;
      to: string;
    }> = [];

    if (hasFunnelData && visitas > 0 && cvr != null) {
      const gapCvr = safePctDiff(cvr, bench.cvr_medio);
      const impactoCvr = Math.max(
        0,
        Math.round(((bench.cvr_medio - cvr) / 100) * visitas * Math.max(ticketForScore, 1)),
      );
      rows.push({
        area: "Taxa de conversão",
        gap: gapCvr == null ? "—" : `${gapCvr > 0 ? "+" : ""}${gapCvr}% vs referência`,
        impacto:
          impactoCvr > 0
            ? `Até R$ ${impactoCvr.toLocaleString("pt-BR")}/mês (estimativa)`
            : "Você está na referência ou acima em CVR",
        cta: "Abrir Funil ConvertIQ",
        to: "/dashboard/funil",
      });
    } else {
      rows.push({
        area: "Dados de funil",
        gap: "Sem visitas/pedidos no período",
        impacto: "Cadastre ou sincronize métricas no Funil para comparar com a referência.",
        cta: "Ir para o Funil",
        to: "/dashboard/funil",
      });
    }

    rows.push({
      area: "Checkout e prescrições",
      gap: "Priorize quick wins",
      impacto: "Veja sugestões priorizadas com base no diagnóstico.",
      cta: "Ver prescrições",
      to: "/dashboard/prescricoes",
    });

    const reativacaoTo = automacoesHidden
      ? "/dashboard/rfm"
      : campanhasHidden
        ? "/dashboard/rfm"
        : "/dashboard/automacoes";
    rows.push({
      area: "Reativação e jornadas",
      gap: automacoesHidden ? "Automações indisponíveis nesta fase" : "Automatizar follow-up",
      impacto: automacoesHidden
        ? "Use segmentação RFM e o Funil enquanto a fase beta não inclui automações."
        : "Ative jornadas para recompra e win-back alinhadas ao seu funil.",
      cta: automacoesHidden ? "Abrir segmentação RFM" : "Abrir automações",
      to: reativacaoTo,
    });

    return rows.slice(0, 3);
  }, [
    automacoesHidden,
    campanhasHidden,
    bench.cvr_medio,
    cvr,
    hasFunnelData,
    ticketForScore,
    visitas,
  ]);

  const loading =
    loja.isLoading || funilPage.isLoading || diags.isLoading;
  const error = loja.isError || funilPage.isError || diags.isError;

  const ga4Stale =
    funilPage.data?.source === "ga4" &&
    !isFunilGa4SnapshotRecent(funilPage.data?.lastIngestedAt ?? null);

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-72 rounded-3xl" />
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-10">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <AlertCircle className="w-8 h-8 text-destructive shrink-0" />
          <div className="flex-1">
            <h2 className="font-bold text-lg">Não foi possível carregar o benchmark</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Tente novamente em instantes. Se persistir, verifique sua sessão e conexão.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 gap-2"
            onClick={() => {
              void loja.refetch();
              void funilPage.refetch();
              void diags.refetch();
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">
            Benchmark Score
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            Compare sua loja com referências de mercado por nicho. O score relativo usa só CVR e
            ticket médio do seu funil no período selecionado.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge variant="secondary" className="text-[10px] font-bold uppercase">
              {funilSourceLabel(funilPage.data?.source ?? "none")}
            </Badge>
            {funilPage.data?.source === "ga4" && funilPage.data.lastIngestedAt && (
              <span className="text-[10px] text-muted-foreground">
                Atualizado GA4:{" "}
                {new Date(funilPage.data.lastIngestedAt).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
            {funilPage.data?.source === "manual" && funilPage.data.lastManualUpdatedAt && (
              <span className="text-[10px] text-muted-foreground">
                Manual:{" "}
                {new Date(funilPage.data.lastManualUpdatedAt).toLocaleString("pt-BR", {
                  dateStyle: "short",
                })}
              </span>
            )}
            {ga4Stale && (
              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                Snapshot GA4 com mais de 3 dias
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 shrink-0">
          <div className="flex flex-wrap gap-2">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <Button
                key={p}
                variant={periodo === p ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs font-bold rounded-xl"
                onClick={() => setPeriodo(p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {BENCHMARK_NICHE_KEYS.map((n) => (
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
      </div>

      {!hasFunnelData && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm flex-1">
            Não há métricas de funil para este período. Configure GA4 ou informe valores manuais no{" "}
            <Link to="/dashboard/funil" className="font-bold text-primary underline-offset-4 hover:underline">
              Funil
            </Link>{" "}
            para ver comparações reais.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">
            Score relativo (estimado) — {nicho}
          </div>
          <div className="relative">
            {hasFunnelData && visitas > 0 ? (
              <>
                <div className="text-8xl font-black font-syne text-primary leading-none">
                  {scoreRelativo}
                </div>
                <div className="text-2xl font-black text-primary/60 absolute -top-1 -right-6">
                  /100
                </div>
              </>
            ) : (
              <div className="text-4xl font-black font-syne text-muted-foreground leading-none py-4">
                —
              </div>
            )}
          </div>
          <div className="space-y-1">
            {hasFunnelData && visitas > 0 ? (
              <>
                <p className="text-sm font-bold">
                  Índice interno com base em CVR e ticket vs. referência de {nicho}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Não é percentil de coorte: quando houver agregado na base, usamos CVR/ticket de{" "}
                  <span className="font-medium">{bench.sectorSegmentLabel}</span>.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Com visitas e pedidos no funil, exibimos o score relativo automaticamente.
              </p>
            )}
          </div>
          {hasFunnelData && visitas > 0 && (
            <div className="w-full space-y-2">
              <Progress value={scoreRelativo} className="h-3" />
              <div className="flex justify-between text-[9px] font-black uppercase text-muted-foreground">
                <span>0</span>
                <span className="text-amber-500">50</span>
                <span className="text-emerald-500">75</span>
                <span className="text-primary">100</span>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {metricasComparativo.map(({ label, sua, media, unidade, maior_melhor }) => {
            const melhor = maior_melhor ? sua >= media : sua <= media;
            const pct = safePctDiff(sua, media);
            const barPct = Math.min(100, Math.round((sua / (media * 1.5)) * 100));
            return (
              <div key={label} className="bg-card border border-border/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-black uppercase tracking-widest">{label}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-black",
                        melhor ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30",
                      )}
                    >
                      {pct == null
                        ? "— vs referência"
                        : `${melhor ? "+" : ""}${pct}% vs referência`}
                    </Badge>
                    {melhor ? (
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
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
                    <Progress value={Number.isFinite(barPct) ? barPct : 0} className="h-2" />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[9px] text-muted-foreground font-black uppercase">
                      Referência
                    </div>
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

      <div className="bg-card border border-border/50 rounded-2xl p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h3 className="font-black text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> CVR: sua loja vs. referência — {nicho}
          </h3>
          <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-primary inline-block" /> Sua loja
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-muted-foreground/40 inline-block" /> Referência
            </span>
          </div>
        </div>
        {chartIsFromDiagnostics ? (
          <p className="text-[11px] text-muted-foreground mb-2">
            Pontos por data de diagnóstico concluído (não é série mensal contínua).
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground mb-2">
            Ilustração mensal aproximada a partir do CVR atual (sem diagnósticos anteriores).
          </p>
        )}
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderRadius: "12px",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [
                  `${v}%`,
                  name === "loja" ? "Sua loja" : "Referência",
                ]}
              />
              <ReferenceLine
                y={bench.cvr_medio}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <Bar dataKey="loja" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="loja" />
              <Bar dataKey="benchmark" fill="hsl(var(--muted))" radius={[6, 6, 0, 0]} name="benchmark" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-black font-syne tracking-tighter uppercase">
            Próximos passos
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {oportunidades.map((op, i) => (
            <div
              key={i}
              className="bg-card border border-border/50 rounded-2xl p-6 space-y-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <Badge className="bg-primary/10 text-primary border-none font-black text-[9px]">
                  {op.gap}
                </Badge>
                <Award className={cn("w-5 h-5", i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-amber-700")} />
              </div>
              <div>
                <h4 className="font-black text-sm">{op.area}</h4>
                <p className="text-sm text-muted-foreground mt-2 leading-snug">{op.impacto}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 text-[10px] font-black uppercase tracking-widest rounded-xl gap-2 hover:bg-primary hover:text-white hover:border-primary transition-all"
                asChild
              >
                <Link to={op.to}>
                  {op.cta} <ArrowRight className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <strong>Referência de mercado:</strong> valores de CVR e ticket para comparação vêm
            preferencialmente da tabela <code className="text-[10px]">sector_benchmarks</code>{" "}
            (segmento &quot;{bench.sectorSegmentLabel}&quot;), quando existir linha no projeto
            Supabase. Caso contrário, usamos tabela interna orientativa alinhada ao seed operacional.
          </p>
          <p>
            {bench.source === "database" && bench.updated_at ? (
              <>
                Última atualização registrada na base:{" "}
                <strong>
                  {new Date(bench.updated_at).toLocaleString("pt-BR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </strong>
                .
              </>
            ) : (
              <>
                Fonte atual: <strong>referência estática</strong> (sem linha utilizável em{" "}
                <code className="text-[10px]">sector_benchmarks</code> para este segmento).
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function STATIC_TICKET_FALLBACK(row: StoreRow | null | undefined): number {
  const t = (row as StoreRow & { ticket_medio?: number })?.ticket_medio;
  if (t != null && Number.isFinite(Number(t)) && Number(t) > 0) return Number(t);
  return 250;
}
