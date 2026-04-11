import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  TrendingUp, Monitor, Smartphone, AlertTriangle,
  RefreshCw, Calendar, Pencil, Sparkles, CheckCircle2,
  Loader2, ChevronRight, Package, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line,
} from "recharts";
import {
  useLoja, useConvertIQConfig, useFunilPageMetricas, useLatestDiagnostico,
  useDiagnosticos, useSaveLoja, useSaveMetricas, useGerarDiagnostico,
  useMetricasEnriquecidas, useDataHealth,
  calcFunil, MOCK_METRICAS, MOCK_CONFIG, MetricasFunil,
  recoveryPctOfRevenue, isFunilGa4SnapshotRecent,
} from "@/hooks/useConvertIQ";
import { useProductsV3 as useProdutosV3, useMetricsV3 } from "@/hooks/useLTVBoost";
import { ECOMMERCE_PLATFORMAS_FUNIL } from "@/lib/ecommerce-platforms";
import type { Database } from "@/lib/database.types";
import { Skeleton } from "@/components/ui/skeleton";
import { isDashboardPathBlockedInBetaScope } from "@/lib/beta-scope";

type Periodo = "7d" | "30d" | "90d";

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

const DIAG_STEPS = [
  { label: "Calculando taxas de conversão",       ms: 2000 },
  { label: "Identificando gargalos críticos",      ms: 3000 },
  { label: "Consultando benchmarks do setor",      ms: 2000 },
  { label: "Gerando recomendações personalizadas", ms: 5000 },
  { label: "Finalizando diagnóstico",              ms: 1500 },
];


// ─── Loading overlay ──────────────────────────────────────────────────────────
function DiagLoadingOverlay() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let t = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    DIAG_STEPS.forEach((s, i) => {
      t += i === 0 ? 0 : DIAG_STEPS[i - 1].ms;
      timers.push(setTimeout(() => setStep(i), t));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const total = DIAG_STEPS.reduce((s, x) => s + x.ms, 0);
  const elapsed = DIAG_STEPS.slice(0, step + 1).reduce((s, x) => s + x.ms, 0);
  const pct = Math.min(100, Math.round((elapsed / total) * 100));

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <h3 className="font-bold text-lg mb-1">Analisando seu funil...</h3>
        <p className="text-xs text-muted-foreground mb-5">~15 segundos</p>
        <div className="space-y-2 mb-5 text-left">
          {DIAG_STEPS.map((s, i) => (
            <div key={i} className={cn("flex items-center gap-2 text-sm transition-colors",
              i < step   ? "text-primary" :
              i === step ? "text-foreground font-medium" :
              "text-muted-foreground"
            )}>
              {i < step
                ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                : i === step
                  ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  : <div className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />
              }
              {s.label}
            </div>
          ))}
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Manual data modal ────────────────────────────────────────────────────────
function ManualModal({ initial, onSave, onClose, loading }: {
  initial: MetricasFunil;
  onSave: (m: MetricasFunil) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [vals, setVals] = useState<MetricasFunil>(initial);
  const set = (k: keyof MetricasFunil, v: string) => setVals(p => ({ ...p, [k]: Number(v) || 0 }));

  const fields: { key: keyof MetricasFunil; label: string }[] = [
    { key: "visitantes",            label: "Visitantes únicos" },
    { key: "visualizacoes_produto", label: "Visualizações de produto" },
    { key: "adicionou_carrinho",    label: "Adições ao carrinho" },
    { key: "iniciou_checkout",      label: "Inícios de checkout" },
    { key: "compras",               label: "Pedidos finalizados" },
    { key: "receita",               label: "Receita total (R$)" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-bold mb-1">Inserir métricas manualmente</h2>
        <p className="text-sm text-muted-foreground mb-4">Use dados do Google Analytics, seu painel de e-commerce ou Semrush</p>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key as string}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                value={vals[f.key] as number}
                onChange={e => set(f.key, e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={() => onSave(vals)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar métricas"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Setup inline card ────────────────────────────────────────────────────────
function SetupCard({ onDone }: { onDone: () => void }) {
  const [nome, setNome] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [ticket, setTicket] = useState("250");
  const [meta, setMeta] = useState("2.5");
  const [url, setUrl] = useState("");
  const [pixKey, setPixKey] = useState("");
  const saveLoja = useSaveLoja();
  const saveMetricas = useSaveMetricas();

  async function handleSubmit() {
    if (!nome || !plataforma) { toast.error("Nome e plataforma são obrigatórios"); return; }
    const loja = await saveLoja.mutateAsync({ nome, plataforma, url: url || undefined, ticket_medio: Number(ticket), meta_conversao: Number(meta), pix_key: pixKey || undefined });
    await saveMetricas.mutateAsync({ lojaId: loja.id, metricas: MOCK_METRICAS });
    onDone();
  }

  return (
    <div className="bg-card border border-primary/20 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-bold text-sm">Configure sua loja para ativar o funil</p>
          <p className="text-xs text-muted-foreground">Leva 30 segundos — você pode ajustar depois</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Nome da loja</Label>
          <Input placeholder="Minha Loja" value={nome} onChange={e => setNome(e.target.value)} className="mt-1 h-9" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Plataforma</Label>
          <Select value={plataforma} onValueChange={setPlataforma}>
            <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              {ECOMMERCE_PLATFORMAS_FUNIL.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ticket médio (R$)</Label>
          <Input type="number" value={ticket} onChange={e => setTicket(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-xs">Meta de conversão (%)</Label>
          <Input type="number" step="0.1" value={meta} onChange={e => setMeta(e.target.value)} className="mt-1 h-9" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">URL da loja</Label>
          <Input placeholder="https://minhaloja.com.br" value={url} onChange={e => setUrl(e.target.value)} className="mt-1 h-9" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Chave PIX (opcional)</Label>
          <Input placeholder="CPF, CNPJ, email ou aleatória" value={pixKey} onChange={e => setPixKey(e.target.value)} className="mt-1 h-9" />
        </div>
      </div>
      <Button
        className="w-full gap-2"
        onClick={handleSubmit}
        disabled={saveLoja.isPending || saveMetricas.isPending}
      >
        {saveLoja.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><TrendingUp className="w-4 h-4" /> Ativar funil</>}
      </Button>
    </div>
  );
}

// ─── Funnel bar ───────────────────────────────────────────────────────────────
function FunnelBar({ label, valor, barPct, dropPct, cor, isCritical }: {
  label: string; valor: number; barPct: number; dropPct: number; cor: string; isCritical?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold">{valor.toLocaleString("pt-BR")}</span>
          {dropPct > 0 && (
            <Badge variant="outline" className={cn("text-[10px] font-bold",
              dropPct > 70 ? "border-red-500/40 text-red-500" :
              dropPct > 40 ? "border-orange-500/40 text-orange-500" :
              "border-yellow-500/40 text-yellow-600"
            )}>
              -{dropPct}% drop
            </Badge>
          )}
        </div>
      </div>
      <div className="h-8 w-full bg-muted/30 rounded-lg overflow-hidden relative">
        <div
          className="h-full rounded-lg transition-all duration-700"
          style={{ width: `${Math.max(barPct, 2)}%`, backgroundColor: cor }}
        />
        {isCritical && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-400 animate-pulse">
            GARGALO
          </span>
        )}
      </div>
    </div>
  );
}

function FunilQueryErrorBar({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-sm">
      <span className="text-destructive font-medium">Não foi possível carregar alguns dados. Verifique a ligação e tente outra vez.</span>
      <Button type="button" size="sm" variant="outline" className="shrink-0 border-destructive/50" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

function FunilKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border rounded-2xl p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Funil() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [showManual, setShowManual] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loja      = useLoja();
  const config    = useConvertIQConfig();
  const funilMetricas = useFunilPageMetricas(loja.data?.id ?? null, periodo);
  const enriched  = useMetricasEnriquecidas(loja.data?.id ?? null, periodo);
  const dataHealth = useDataHealth(loja.data?.id ?? null, periodo);
  const lastDiag  = useLatestDiagnostico(loja.data?.id ?? null);
  const allDiags  = useDiagnosticos(loja.data?.id ?? null);
  const produtos  = useProdutosV3(loja.data?.id);
  const metricsV3 = useMetricsV3(loja.data?.id);
  const saveMet   = useSaveMetricas();
  const gerarDiag = useGerarDiagnostico();

  const pageM = funilMetricas.data;
  const isMock = !!loja.data && pageM?.source === "none";

  const refetchQueries = () => {
    funilMetricas.refetch();
    enriched.refetch();
    dataHealth.refetch();
    produtos.refetch();
    metricsV3.refetch();
    lastDiag.refetch();
    allDiags.refetch();
  };

  const hasQueryError =
    funilMetricas.isError || enriched.isError || dataHealth.isError || produtos.isError || metricsV3.isError
    || lastDiag.isError || allDiags.isError;

  // Enriched data handling
  const recFrete = enriched.data?.receita_travada_frete ?? MOCK_METRICAS.receita_travada_frete ?? 0;
  const recPag   = enriched.data?.receita_travada_pagamento ?? MOCK_METRICAS.receita_travada_pagamento ?? 0;
  const totalF   = enriched.data?.total_abandonos_frete ?? MOCK_METRICAS.total_abandonos_frete ?? 0;
  const totalP   = enriched.data?.total_abandonos_pagamento ?? MOCK_METRICAS.total_abandonos_pagamento ?? 0;

  const baseMetricas: MetricasFunil =
    loja.data && pageM?.metricas
      ? pageM.metricas
      : MOCK_METRICAS;

  const raw: MetricasFunil = {
    ...baseMetricas,
    receita_travada_frete: recFrete,
    receita_travada_pagamento: recPag,
    total_abandonos_frete: totalF,
    total_abandonos_pagamento: totalP,
    fonte:
      pageM?.source === "ga4"
        ? "ga4"
        : pageM?.source === "manual"
          ? "real"
          : (baseMetricas.fonte ?? "mockado"),
  };

  const meta   = Number(config.data?.meta_conversao ?? MOCK_CONFIG.meta_conversao);
  const store = loja.data as StoreRow | null | undefined;
  const ticket = Number(
    (store as StoreRow & { ticket_medio?: number })?.ticket_medio ?? MOCK_CONFIG.ticket_medio,
  );
  const { taxaConversao, perdaMensal, etapas, maiorGargalo } = calcFunil(raw, meta, ticket);

  const maxDropIdx = etapas.reduce((mi, e, i) => i > 0 && e.dropPct > (etapas[mi]?.dropPct ?? 0) ? i : mi, 1);

  const recoveryPct = recoveryPctOfRevenue(recFrete, recPag, raw.receita);

  const diagsForChart = [...(allDiags.data ?? [])].reverse();
  const chartData =
    diagsForChart.length >= 2
      ? diagsForChart.map((d) => ({
          data: new Date(d.created_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
          cvr: Number(d.taxa_conversao),
          bench: meta,
          score: d.score,
        }))
      : [];

  const hasRecentGa4Layout =
    !!loja.data &&
    pageM?.source === "ga4" &&
    isFunilGa4SnapshotRecent(pageM.lastIngestedAt ?? null);

  const showDeviceBreakdown =
    !!metricsV3.data &&
    (metricsV3.data.mobile_visitors > 0 || metricsV3.data.desktop_visitors > 0);

  const mobileCvr = metricsV3.data?.mobile_cvr ?? 0;
  const desktopCvr = metricsV3.data?.desktop_cvr ?? 0;
  const deviceGapPp = showDeviceBreakdown ? mobileCvr - desktopCvr : 0;
  const showMobileGapAlert =
    showDeviceBreakdown && desktopCvr > 0 && mobileCvr > 0 && mobileCvr < desktopCvr / 1.2;
  const mobileRecoveryHint =
    perdaMensal > 0 ? Math.round(perdaMensal * 0.15) : 0;

  // CVR drop alert: compare latest vs previous diagnostic
  const cvrDrop = (allDiags.data ?? []).length >= 2
    ? Number(allDiags.data![0].taxa_conversao) - Number(allDiags.data![1].taxa_conversao)
    : 0;
  const showCvrAlert = cvrDrop < 0 && Math.abs(cvrDrop) / Number(allDiags.data![1]?.taxa_conversao ?? 1) > 0.15;

  // Top 5 products with worst conversion and best revenue
  const produtosList = (produtos.data ?? []) as Array<{
    id: string; nome: string; sku?: string; preco?: number;
    estoque?: number; taxa_conversao_produto?: number; receita_30d?: number;
  }>;
  const topProdutos = [...produtosList]
    .sort((a, b) => (a.taxa_conversao_produto ?? 0) - (b.taxa_conversao_produto ?? 0))
    .slice(0, 5);

  async function handleGerar() {
    if (!loja.data) return;
    setGenerating(true);
    try {
      await gerarDiag.mutateAsync({ lojaId: loja.data.id, metricas: raw, metaConversao: meta });
      toast.success("Diagnóstico gerado com sucesso!");
      navigate("/dashboard/funil/diagnostico");
    } catch { /* error already toasted in hook */ } finally {
      setGenerating(false);
    }
  }

  async function handleSaveManual(m: MetricasFunil) {
    if (!loja.data) return;
    await saveMet.mutateAsync({ lojaId: loja.data.id, metricas: m });
    setShowManual(false);
    funilMetricas.refetch();
  }

  const campanhasBlocked = isDashboardPathBlockedInBetaScope("/dashboard/campanhas");
  const whatsappBlocked = isDashboardPathBlockedInBetaScope("/dashboard/whatsapp");

  const syncSubtitle = (() => {
    if (!loja.data || !pageM) return null;
    if (pageM.source === "ga4" && pageM.lastIngestedAt) {
      return `GA4 · última sincronização: ${new Date(pageM.lastIngestedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    }
    if (pageM.source === "manual" && pageM.lastManualUpdatedAt) {
      return `Métricas manuais · atualizado: ${new Date(pageM.lastManualUpdatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    }
    if (pageM.source === "manual") return "Métricas manuais (último snapshot no período)";
    return null;
  })();

  if (loja.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {generating && <DiagLoadingOverlay />}

      {showManual && (
        <ManualModal
          initial={raw}
          onSave={handleSaveManual}
          onClose={() => setShowManual(false)}
          loading={saveMet.isPending}
        />
      )}

      {hasQueryError && <FunilQueryErrorBar onRetry={refetchQueries} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase italic">
            Funil de <span className="text-primary">Conversão</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {store
              ? `${store.name} · ${store.segment ?? "—"}`
              : "Análise profunda do comportamento de compra"}
          </p>
          {loja.data && (
            <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">
              Métricas do funil: último snapshot disponível para o período selecionado ({periodo}).
              {syncSubtitle ? ` ${syncSubtitle}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted rounded-xl p-1">
            {(["7d", "30d", "90d"] as Periodo[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  periodo === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >{p}</button>
            ))}
          </div>
          {loja.data && (
            <Button variant="outline" size="sm" className="h-9 font-bold gap-1.5 rounded-xl" onClick={() => setShowManual(true)}>
              <Pencil className="w-3.5 h-3.5" /> Editar dados
            </Button>
          )}
          <Button size="sm" className="h-9 font-bold gap-1.5 rounded-xl shadow-lg shadow-primary/20" onClick={handleGerar} disabled={generating || !loja.data}>
            <Sparkles className="w-3.5 h-3.5" /> Diagnóstico IA
          </Button>
        </div>
      </div>

      {/* Setup card — só aparece se não tem loja configurada */}
      {!loja.data && (
        <SetupCard onDone={() => loja.refetch()} />
      )}

      {/* Mock data banner */}
      {loja.data && isMock && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
          <span className="text-amber-500 font-bold shrink-0">📊 Dados demonstrativos</span>
          <span className="text-muted-foreground">—</span>
          <button className="text-amber-600 underline font-medium hover:no-underline" onClick={() => setShowManual(true)}>
            Inserir seus dados reais
          </button>
        </div>
      )}

      {/* CVR drop alert */}
      {showCvrAlert && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 animate-in fade-in duration-300">
          <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-500">
              Alerta: sua taxa de conversão caiu {Math.abs(cvrDrop).toFixed(2)}pp ({(Math.abs(cvrDrop) / Number(allDiags.data![1].taxa_conversao) * 100).toFixed(0)}%) em relação ao último diagnóstico
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Gere um novo diagnóstico com IA para identificar a causa</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 font-bold rounded-xl border-red-500/40 text-red-500 hover:bg-red-500/10" onClick={handleGerar} disabled={generating}>
            <Sparkles className="w-3.5 h-3.5 mr-1" /> Diagnosticar
          </Button>
        </div>
      )}

      {/* KPI cards */}
      {loja.data && funilMetricas.isPending && !funilMetricas.data ? (
        <FunilKpiSkeleton />
      ) : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Conversão Atual</p>
          <p className="text-3xl font-black font-mono">{taxaConversao}%</p>
          <p className="text-xs text-muted-foreground mt-1">Meta: {meta}%</p>
          <span className={cn("inline-flex items-center mt-2 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
            taxaConversao >= meta ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
          )}>
            {taxaConversao >= meta ? "✓ Acima da meta" : `▼ ${(meta - taxaConversao).toFixed(2)}pp abaixo`}
          </span>
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Perda Estimada/Mês</p>
          <p className="text-3xl font-black font-mono text-red-500">R$ {perdaMensal.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">vs. atingir a meta de {meta}%</p>
          {perdaMensal > 0 && (
            <span className="inline-flex items-center mt-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 uppercase tracking-widest">
              ↑ Recuperável
            </span>
          )}
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Visitantes</p>
          <p className="text-3xl font-black font-mono">{raw.visitantes.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">últimos {periodo}</p>
        </div>

        <div className="bg-card border rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Maior Gargalo</p>
          <p className="text-sm font-black leading-tight">{maiorGargalo.label}</p>
          <p className="text-xs text-muted-foreground mt-1">Apenas {(100 - maiorGargalo.drop).toFixed(0)}% continuam</p>
          <span className="inline-flex items-center mt-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 uppercase tracking-widest animate-pulse">
            Crítico
          </span>
        </div>
      </div>
      )}

      {/* Data Health Score */}
      {loja.data && (
        <div className="bg-card border rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div>
              <h3 className="font-black text-base uppercase tracking-tighter">Data Health Score</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Qualidade de dados para confiar em diagnóstico e atribuição financeira.
              </p>
            </div>
            <div className="text-right">
              <p className={cn(
                "text-3xl font-black font-mono",
                (dataHealth.data?.score ?? 0) >= 85 ? "text-emerald-500" : (dataHealth.data?.score ?? 0) >= 65 ? "text-amber-500" : "text-red-500"
              )}>
                {dataHealth.isLoading ? "..." : `${dataHealth.data?.score ?? 0}`}
              </p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {dataHealth.data?.status === "saudavel" ? "Saudável" : dataHealth.data?.status === "atencao" ? "Atenção" : "Crítico"}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Cobertura de eventos", value: dataHealth.data?.coberturaEventos ?? 0 },
              { label: "Estabilidade tracking", value: dataHealth.data?.estabilidadeTracking ?? 0 },
              { label: "Consistência de fontes", value: dataHealth.data?.consistenciaFontes ?? 0 },
              { label: "Deduplicação", value: dataHealth.data?.deduplicacao ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{item.label}</p>
                <p className="text-lg font-black font-mono">{item.value}%</p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      item.value >= 85 ? "bg-emerald-500" : item.value >= 65 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${Math.max(4, item.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {(dataHealth.data?.alertas ?? []).length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                Sem alertas críticos de dados no período.
              </p>
            ) : (
              (dataHealth.data?.alertas ?? []).map((a) => (
                <div key={a.id} className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  a.severidade === "critico"
                    ? "border-red-500/30 bg-red-500/10"
                    : a.severidade === "alto"
                      ? "border-orange-500/30 bg-orange-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                )}>
                  <p className="font-bold">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.detalhe}</p>
                </div>
              ))
            )}
          </div>

          {(dataHealth.data?.canais?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Data Health por canal</p>
              <div className="grid md:grid-cols-3 gap-3">
                {(dataHealth.data?.canais ?? []).slice(0, 3).map((c) => (
                  <div key={c.canal} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase">{c.canal}</p>
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        c.score >= 85 ? "text-emerald-500" : c.score >= 65 ? "text-amber-500" : "text-red-500"
                      )}>
                        {c.score}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      env. {c.sent.toLocaleString("pt-BR")} · ent. {c.delivered.toLocaleString("pt-BR")} · lidas {c.read.toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(dataHealth.data?.etapas?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Data Health por etapa</p>
              <div className="grid md:grid-cols-4 gap-3">
                {(dataHealth.data?.etapas ?? []).map((e) => (
                  <div key={e.etapa} className="rounded-xl border p-3">
                    <p className="text-xs font-bold uppercase">{e.etapa}</p>
                    <p className={cn(
                      "text-lg font-mono font-bold mt-1",
                      e.score >= 85 ? "text-emerald-500" : e.score >= 65 ? "text-amber-500" : "text-red-500"
                    )}>
                      {e.score}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={cn(
            "mt-4 rounded-xl border p-3 text-xs",
            dataHealth.data?.recomendacoesConfiaveis ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"
          )}>
            <p className="font-bold">
              {dataHealth.data?.recomendacoesConfiaveis
                ? "Quality Gate ativo: recomendações críticas liberadas."
                : `Quality Gate: score abaixo de ${dataHealth.data?.scoreMinimoRecomendacao ?? 70}; recomendações críticas devem ser revisadas manualmente.`}
            </p>
          </div>
        </div>
      )}

      {loja.data && dataHealth.data?.metricContract && (
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-black text-base uppercase tracking-tighter mb-4">Contrato canônico de métricas</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {dataHealth.data.metricContract.map((m) => (
              <div key={m.metrica} className="rounded-xl border p-3">
                <p className="text-xs font-bold">{m.metrica}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.definicao}</p>
                <p className="text-[11px] mt-2 font-medium">Tolerância: {m.tolerancia}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Potential Recovery Dashboard */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="font-black text-base uppercase tracking-tighter flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Recuperação Potencial (ConvertIQ)
          </h3>
          {recoveryPct != null ? (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-black" title="Estimativa a partir de carrinhos pendentes; não substitui contabilidade.">
              {periodo} · {recoveryPct.toFixed(1)}% da receita atual (estimativa)
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border font-black">
              {periodo} · receita zero — sem percentual
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-6 max-w-3xl">
          Valores estimados a partir de carrinhos pendentes (heurística interna); não são contabilidade nem garantia de recuperação.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-orange-500" />
              </div>
              <span className="text-2xl font-black font-mono">R$ {recFrete.toLocaleString("pt-BR")}</span>
            </div>
            <h4 className="font-bold text-sm mb-1 uppercase tracking-tight">Barreira de Frete Alto</h4>
            <p className="text-xs text-muted-foreground mb-4">
              {totalF} clientes abandonaram porque o frete representava {">"}20% do pedido.
            </p>
            {campanhasBlocked ? (
              <Button size="sm" variant="outline" className="w-full gap-2 font-bold border-muted text-muted-foreground" disabled title="Campanhas indisponíveis nesta fase beta">
                <Sparkles className="w-3 h-3" /> Criar campanha
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="w-full gap-2 font-bold border-orange-500/30 text-orange-600 hover:bg-orange-500/5" asChild>
                <Link to="/dashboard/campanhas">
                  <Sparkles className="w-3 h-3" /> Criar campanha
                </Link>
              </Button>
            )}
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-2xl font-black font-mono">R$ {recPag.toLocaleString("pt-BR")}</span>
            </div>
            <h4 className="font-bold text-sm mb-1 uppercase tracking-tight">Falha Técnica no Pagamento</h4>
            <p className="text-xs text-muted-foreground mb-4">
              {totalP} pedidos não finalizados por erro no gateway ou cartão negado.
            </p>
            {whatsappBlocked ? (
              <Button size="sm" variant="outline" className="w-full gap-2 font-bold border-muted text-muted-foreground" disabled title="WhatsApp indisponível nesta fase beta">
                <Smartphone className="w-3 h-3" /> Abrir WhatsApp
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="w-full gap-2 font-bold border-red-500/30 text-red-600 hover:bg-red-500/5" asChild>
                <Link to="/dashboard/whatsapp">
                  <Smartphone className="w-3 h-3" /> Abrir WhatsApp
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Funil + Mobile comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Funil visual */}
        <div className="md:col-span-2 bg-card border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-base uppercase tracking-tighter flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Funil Visual
            </h3>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => funilMetricas.refetch()}>
              <RefreshCw className={cn("w-3.5 h-3.5", funilMetricas.isFetching && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          <div className="space-y-4">
            {etapas.map((e, i) => (
              <FunnelBar
                key={e.label}
                label={e.label}
                valor={e.valor}
                barPct={e.barPct}
                dropPct={e.dropPct}
                cor={e.cor}
                isCritical={i === maxDropIdx && e.dropPct > 50}
              />
            ))}
          </div>

          <div className="mt-5 p-4 rounded-xl bg-muted/40 border">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Análise rápida</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A maior queda está em <strong className="text-foreground">{maiorGargalo.label}</strong> ({maiorGargalo.drop.toFixed(0)}% de abandono).
              {raw.compras > 0 && raw.iniciou_checkout > 0 && (
                <> Essa perda representa <strong className="text-foreground">R$ {Math.round((raw.iniciou_checkout - raw.compras) * ticket * 0.1).toLocaleString("pt-BR")}</strong> de receita potencial por mês.</>
              )}
            </p>
          </div>
        </div>

        {/* Mobile/Desktop comparison */}
        <div className="space-y-6">
          {showMobileGapAlert && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
              <h3 className="font-black text-sm mb-2 flex items-center gap-2 text-red-500 uppercase tracking-tighter">
                <AlertTriangle className="w-4 h-4" /> Alerta Mobile
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A conversão em mobile está abaixo da de desktop. Melhorar checkout mobile pode reduzir parte da perda estimada do funil
                {mobileRecoveryHint > 0 ? (
                  <> (ordem de grandeza ~R$ {mobileRecoveryHint.toLocaleString("pt-BR")}/mês, estimativa).</>
                ) : (
                  <>.</>
                )}
              </p>
            </div>
          )}

          {showDeviceBreakdown ? (
            <div className="bg-card border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-sm uppercase tracking-tighter">Por dispositivo</h3>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-1.5 py-0.5 bg-muted rounded-full">Fonte: métricas v3</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <Smartphone className="w-4 h-4 text-indigo-500" />
                    </div>
                    <span className="text-sm font-bold">Mobile</span>
                  </div>
                  <span className="text-lg font-black font-mono text-indigo-500">{mobileCvr.toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                      <Monitor className="w-4 h-4 text-slate-500" />
                    </div>
                    <span className="text-sm font-bold">Desktop</span>
                  </div>
                  <span className="text-lg font-black font-mono text-slate-500">{desktopCvr.toFixed(2)}%</span>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t border-border/50">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gap mobile vs desktop (pp)</span>
                  <span className={cn("text-xs font-black", deviceGapPp < 0 ? "text-red-500" : "text-muted-foreground")}>
                    {deviceGapPp >= 0 ? "+" : ""}{deviceGapPp.toFixed(2)}pp
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(4, Math.abs(deviceGapPp) * 20))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-dashed rounded-2xl p-6 text-center text-sm text-muted-foreground">
              Sem dados de conversão por dispositivo na base atual. Sincronize métricas v3 ou use GA4 no funil principal.
            </div>
          )}
        </div>
      </div>

      {/* Funil por Produto */}
      {loja.data && topProdutos.length > 0 && (
        <div className="bg-card border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-black text-base uppercase tracking-tighter flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Funil por Produto
            </h3>
            <Link to="/dashboard/produtos" className="text-xs text-primary font-black hover:underline uppercase tracking-widest">
              Ver todos <ChevronRight className="w-3 h-3 inline" />
            </Link>
          </div>
          <div className="space-y-3">
            {topProdutos.map((p, i) => {
              const cvr = p.taxa_conversao_produto ?? 0;
              const receita = p.receita_30d ?? 0;
              const maxReceita = topProdutos[0]?.receita_30d ?? 1;
              const pct = maxReceita > 0 ? (receita / maxReceita) * 100 : 0;
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold truncate">{p.nome}</span>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className={cn("text-xs font-mono font-black",
                          cvr < 5 ? "text-red-500" : cvr < 10 ? "text-amber-500" : "text-emerald-500"
                        )}>{cvr.toFixed(1)}% cvr</span>
                        <span className="text-xs font-mono text-muted-foreground">R$ {receita.toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all",
                          cvr < 5 ? "bg-red-500" : cvr < 10 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Produtos ordenados por menor taxa de conversão — priorize ações de campanha nos com CVR abaixo de 5%.
          </p>
        </div>
      )}

      {/* Último Diagnóstico IA */}
      {loja.data && (
        lastDiag.data ? (
          <div className="bg-card border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="font-black text-sm uppercase tracking-tighter">Último Diagnóstico IA</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(lastDiag.data.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{lastDiag.data.resumo}</p>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                Score {lastDiag.data.score}/100
              </span>
              <Link
                to="/dashboard/funil/diagnostico"
                className="flex items-center gap-1 text-xs text-primary font-black hover:underline ml-auto uppercase tracking-widest"
              >
                Ver diagnóstico completo <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-dashed rounded-2xl p-6 text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-black text-sm uppercase tracking-tighter mb-1">Nenhum diagnóstico ainda</h3>
            <p className="text-sm text-muted-foreground mb-4">Gere um diagnóstico com IA para identificar os gargalos com severidade e impacto em R$</p>
            <Button onClick={handleGerar} disabled={generating} className="gap-2 font-black rounded-xl">
              <Sparkles className="w-4 h-4" /> Gerar diagnóstico com IA
            </Button>
          </div>
        )
      )}

      {/* Histórico CVR vs meta */}
      <div className="bg-card border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h3 className="font-black text-base uppercase tracking-tighter flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Histórico CVR vs meta
          </h3>
          {chartData.length < 2 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-widest">
              Gere pelo menos 2 diagnósticos para ver a tendência
            </span>
          )}
        </div>
        {chartData.length >= 2 ? (
          <>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCvr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                  <XAxis dataKey="data" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderRadius: "12px", border: "1px solid hsl(var(--border))" }}
                    itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                  />
                  <Area type="monotone" dataKey="cvr" name="Sua CVR" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorCvr)" strokeWidth={3} />
                  <Line type="monotone" dataKey="bench" name="Meta" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 mt-4 justify-center">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <div className="w-3 h-0.5 bg-primary rounded-full" /> Sua CVR
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <div className="w-3 h-0.5 bg-muted-foreground rounded-full" style={{ backgroundImage: "repeating-linear-gradient(90deg,currentColor 0,currentColor 3px,transparent 3px,transparent 6px)" }} /> Meta ({meta}%)
              </div>
            </div>
          </>
        ) : (
          <div className="h-[200px] flex flex-col items-center justify-center text-center text-sm text-muted-foreground border border-dashed rounded-xl px-4">
            Ainda não há histórico suficiente de diagnósticos concluídos para esta loja. Gere dois ou mais diagnósticos com IA para ver a evolução da taxa de conversão face à meta.
          </div>
        )}
      </div>

      {/* Canal + horário: sem dados granulares nesta versão */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-2xl p-6 md:col-span-2">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="font-black text-sm uppercase tracking-tighter flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Canal de aquisição e horários
            </h3>
            {hasRecentGa4Layout && (
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary">
                GA4 sincronizado (funil)
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            {hasRecentGa4Layout
              ? "O funil acima reflete o GA4. Breakdown por canal de aquisição e por faixa horária ainda não está disponível nesta versão do produto."
              : "Dados por canal de aquisição e por faixa horária não estão disponíveis sem sincronização recente do GA4 (últimos 3 dias)."}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground border-t pt-6 max-w-3xl leading-relaxed">
        As métricas de perda, recuperação e conversão apresentadas são estimativas com base nos dados sincronizados ou inseridos por si; não constituem aconselhamento financeiro nem garantia de resultados.
      </p>
    </div>
  );
}
