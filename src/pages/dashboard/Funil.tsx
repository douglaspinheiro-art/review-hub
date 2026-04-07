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
  useLoja, useConvertIQConfig, useMetricasFunil, useLatestDiagnostico,
  useDiagnosticos, useSaveLoja, useSaveMetricas, useGerarDiagnostico,
  useMetricasEnriquecidas,
  calcFunil, MOCK_METRICAS, MOCK_CONFIG, MetricasFunil,
} from "@/hooks/useConvertIQ";
import { useProductsV3 as useProdutosV3 } from "@/hooks/useLTVBoost";
import { mockMetricas } from "@/lib/mock-data";

type Periodo = "7d" | "30d" | "90d";

const PLATAFORMAS = ["Shopify", "VTEX", "WooCommerce", "Nuvemshop", "Tray", "Outro"];

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
            <SelectContent>{PLATAFORMAS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Funil() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [showManual, setShowManual] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loja      = useLoja();
  const config    = useConvertIQConfig();
  const metrics   = useMetricasFunil(loja.data?.id ?? null, periodo);
  const enriched  = useMetricasEnriquecidas(loja.data?.id ?? null, periodo);
  const lastDiag  = useLatestDiagnostico(loja.data?.id ?? null);
  const allDiags  = useDiagnosticos(loja.data?.id ?? null);
  const produtos  = useProdutosV3(loja.data?.id);
  const saveMet   = useSaveMetricas();
  const gerarDiag = useGerarDiagnostico();

  const isMock = !metrics.data;
  
  // Enriched data handling
  const recFrete = enriched.data?.receita_travada_frete ?? MOCK_METRICAS.receita_travada_frete ?? 0;
  const recPag   = enriched.data?.receita_travada_pagamento ?? MOCK_METRICAS.receita_travada_pagamento ?? 0;
  const totalF   = enriched.data?.total_abandonos_frete ?? MOCK_METRICAS.total_abandonos_frete ?? 0;
  const totalP   = enriched.data?.total_abandonos_pagamento ?? MOCK_METRICAS.total_abandonos_pagamento ?? 0;

  const raw: MetricasFunil = metrics.data
    ? {
        ...metrics.data,
        receita_travada_frete: recFrete,
        receita_travada_pagamento: recPag,
        total_abandonos_frete: totalF,
        total_abandonos_pagamento: totalP,
        fonte: "real",
      }
    : {
        ...MOCK_METRICAS,
        receita_travada_frete: recFrete,
        receita_travada_pagamento: recPag,
        total_abandonos_frete: totalF,
        total_abandonos_pagamento: totalP,
      };

  const meta   = Number(config.data?.meta_conversao ?? MOCK_CONFIG.meta_conversao);
  const ticket = Number((loja.data as any)?.ticket_medio     ?? MOCK_CONFIG.ticket_medio);
  const { taxaConversao, perdaMensal, etapas, maiorGargalo } = calcFunil(raw, meta, ticket);

  const maxDropIdx = etapas.reduce((mi, e, i) => i > 0 && e.dropPct > (etapas[mi]?.dropPct ?? 0) ? i : mi, 1);

  const m = mockMetricas;

  // Build chart data from real diagnostics (newest last for chart)
  const diagsForChart = [...(allDiags.data ?? [])].reverse();
  const chartData = diagsForChart.length >= 2
    ? diagsForChart.map((d, i) => ({
        data: new Date(d.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        cvr: Number(d.taxa_conversao),
        bench: 2.8,
        score: d.score,
      }))
    : [
        { data: "Sem 1", cvr: 1.2, bench: 2.8, score: 0 },
        { data: "Sem 2", cvr: 1.4, bench: 2.8, score: 0 },
        { data: "Sem 3", cvr: 1.1, bench: 2.8, score: 0 },
        { data: "Sem 4", cvr: 1.6, bench: 2.8, score: 0 },
        { data: "Sem 5", cvr: 1.4, bench: 2.8, score: 0 },
        { data: "Sem 6", cvr: 1.5, bench: 2.8, score: 0 },
        { data: "Sem 7", cvr: taxaConversao, bench: 2.8, score: 0 },
      ];

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
    metrics.refetch();
  }

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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase italic">
            Funil de <span className="text-primary">Conversão</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loja.data ? `${(loja.data as any).nome ?? loja.data.name} · ${(loja.data as any).plataforma ?? (loja.data as any).segment}` : "Análise profunda do comportamento de compra"}
          </p>
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

      {/* Potential Recovery Dashboard */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-base uppercase tracking-tighter flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Recuperação Potencial (ConvertIQ)
          </h3>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-black">
            {periodo} · {((recFrete + recPag) / raw.receita * 100).toFixed(1)}% da Receita Atual
          </Badge>
        </div>

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
            <Button size="sm" variant="outline" className="w-full gap-2 font-bold border-orange-500/30 text-orange-600 hover:bg-orange-500/5">
              <Sparkles className="w-3 h-3" /> Ver campanha de Frete Grátis
            </Button>
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
            <Button size="sm" variant="outline" className="w-full gap-2 font-bold border-red-500/30 text-red-600 hover:bg-red-500/5">
              <Smartphone className="w-3 h-3" /> Oferecer link PIX (WhatsApp)
            </Button>
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
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => metrics.refetch()}>
              <RefreshCw className={cn("w-3.5 h-3.5", metrics.isFetching && "animate-spin")} />
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
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
            <h3 className="font-black text-sm mb-2 flex items-center gap-2 text-red-500 uppercase tracking-tighter">
              <AlertTriangle className="w-4 h-4" /> Alerta Mobile
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Usuários mobile convertem <span className="text-red-500 font-bold">2.8x menos</span> que desktop. Otimizar o checkout mobile pode recuperar <span className="text-foreground font-bold">+R$ 21.000/mês</span>.
            </p>
          </div>

          <div className="bg-card border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-sm uppercase tracking-tighter">Por Dispositivo</h3>
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-1.5 py-0.5 bg-muted rounded-full">Estimado</span>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-indigo-500" />
                  </div>
                  <span className="text-sm font-bold">Mobile</span>
                </div>
                <span className="text-lg font-black font-mono text-indigo-500">{m.cvr_mobile}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-slate-500" />
                  </div>
                  <span className="text-sm font-bold">Desktop</span>
                </div>
                <span className="text-lg font-black font-mono text-slate-500">{m.cvr_desktop}%</span>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-border/50">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gap Mobile vs Desktop</span>
                <span className="text-xs font-black text-red-500">-1.45pp ⚠️</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: "38%" }} />
              </div>
            </div>
          </div>
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

      {/* Histórico CVR vs Benchmark */}
      <div className="bg-card border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-black text-base uppercase tracking-tighter flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Histórico CVR vs Benchmark
          </h3>
          {diagsForChart.length < 2 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-widest">
              Dados estimados — gere diagnósticos para ver real
            </span>
          )}
        </div>
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
              <Line type="monotone" dataKey="bench" name="Benchmark" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" dot={false} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-6 mt-4 justify-center">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <div className="w-3 h-0.5 bg-primary rounded-full" /> Sua CVR
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <div className="w-3 h-0.5 bg-muted-foreground rounded-full" style={{ backgroundImage: "repeating-linear-gradient(90deg,currentColor 0,currentColor 3px,transparent 3px,transparent 6px)" }} /> Benchmark setor
          </div>
        </div>
      </div>

      {/* Canal de Aquisição + Horário — grid 2 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Canal de aquisição */}
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-black text-sm uppercase tracking-tighter mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Canal de Aquisição
          </h3>
          <div className="space-y-3">
            {[
              { canal: "Orgânico / SEO", cvr: "2.1%", share: "38%", cor: "bg-emerald-500" },
              { canal: "Direto",         cvr: "1.9%", share: "24%", cor: "bg-blue-500" },
              { canal: "Social / Ads",   cvr: "1.1%", share: "22%", cor: "bg-pink-500" },
              { canal: "Email",          cvr: "3.4%", share: "11%", cor: "bg-violet-500" },
              { canal: "WhatsApp",       cvr: "4.2%", share: "5%",  cor: "bg-green-500" },
            ].map(c => (
              <div key={c.canal} className="flex items-center gap-3">
                <div className={cn("w-2 h-2 rounded-full shrink-0", c.cor)} />
                <span className="text-xs font-bold flex-1">{c.canal}</span>
                <span className="text-xs font-mono text-muted-foreground">{c.share}</span>
                <span className={cn("text-xs font-mono font-black", parseFloat(c.cvr) >= 3 ? "text-emerald-500" : parseFloat(c.cvr) >= 2 ? "text-amber-500" : "text-red-500")}>
                  {c.cvr}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 font-medium">
            📡 Conecte GA4 para dados reais de atribuição
          </p>
        </div>

        {/* Funil por Horário */}
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-black text-sm uppercase tracking-tighter mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Horários de Maior Conversão
          </h3>
          <div className="space-y-2">
            {[
              { hora: "19h–21h", cvr: 3.8, peak: true },
              { hora: "12h–14h", cvr: 2.9, peak: false },
              { hora: "09h–11h", cvr: 2.1, peak: false },
              { hora: "22h–00h", cvr: 1.7, peak: false },
              { hora: "06h–08h", cvr: 0.9, peak: false },
            ].map(h => (
              <div key={h.hora} className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{h.hora}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-md overflow-hidden relative">
                  <div
                    className={cn("h-full rounded-md transition-all", h.peak ? "bg-primary" : "bg-muted-foreground/30")}
                    style={{ width: `${(h.cvr / 3.8) * 100}%` }}
                  />
                </div>
                <span className={cn("text-xs font-mono font-black w-10 text-right shrink-0", h.peak ? "text-primary" : "text-muted-foreground")}>
                  {h.cvr}%
                </span>
                {h.peak && <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-full uppercase">Peak</span>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 font-medium">
            📡 Conecte GA4 para dados reais por faixa horária
          </p>
        </div>
      </div>
    </div>
  );
}
