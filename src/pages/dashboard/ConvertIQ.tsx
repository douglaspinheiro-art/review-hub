import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  TrendingUp, RefreshCw, Sparkles, Loader2, Pencil, CheckCircle2, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useLoja, useConvertIQConfig, useFunilPageMetricas, useLatestDiagnostico,
  useSaveMetricas, useGerarDiagnostico,
  EMPTY_FUNIL_METRICAS, DEFAULT_CONFIG, calcFunil, MetricasFunil,
} from "@/hooks/useConvertIQ";
import type { Database } from "@/lib/database.types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Period toggle ────────────────────────────────────────────────────────────
type Periodo = "7d" | "30d" | "90d";

type StoreRow = Database["public"]["Tables"]["stores"]["Row"];

// ─── Loading overlay (5 steps) ───────────────────────────────────────────────
const DIAG_STEPS = [
  { label: "Calculando taxas de conversão",          ms: 2000 },
  { label: "Identificando gargalos críticos",         ms: 3000 },
  { label: "Consultando benchmarks do setor",         ms: 2000 },
  { label: "Gerando recomendações personalizadas",    ms: 5000 },
  { label: "Finalizando diagnóstico",                 ms: 1500 },
];

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
              i < step  ? "text-primary" :
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
interface ManualModalProps {
  initial: MetricasFunil;
  onSave: (m: MetricasFunil) => void;
  onClose: () => void;
  loading: boolean;
}

function ManualModal({ initial, onSave, onClose, loading }: ManualModalProps) {
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
        <p className="text-sm text-muted-foreground mb-4">Use dados do Google Analytics, Semrush ou seu painel de e-commerce</p>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key}>
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

// ─── Funnel bar ───────────────────────────────────────────────────────────────
function FunnelBar({ label, valor, barPct, dropPct, cor, isCritical }: {
  label: string; valor: number; barPct: number; dropPct: number; cor: string; isCritical?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono font-bold">{valor.toLocaleString("pt-BR")}</span>
      </div>
      <div className="h-8 bg-muted rounded-lg overflow-hidden relative">
        <div
          className="h-full rounded-lg transition-all duration-500"
          style={{ width: `${Math.max(barPct, 2)}%`, backgroundColor: cor }}
        />
        {isCritical && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-400 animate-pulse">
            GARGALO
          </span>
        )}
      </div>
      {dropPct > 0 && (
        <div className="flex justify-end">
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            dropPct > 70 ? "bg-red-500/15 text-red-500" :
            dropPct > 40 ? "bg-orange-500/15 text-orange-500" :
            "bg-yellow-500/15 text-yellow-600"
          )}>
            ▼ {dropPct}% saíram
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConvertIQ() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [showManual, setShowManual] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loja    = useLoja();
  const config  = useConvertIQConfig();
  const funilPage = useFunilPageMetricas(loja.data?.id ?? null, periodo);
  const lastDiag = useLatestDiagnostico(loja.data?.id ?? null);
  const saveMet  = useSaveMetricas();
  const gerarDiag = useGerarDiagnostico();

  // Redirect to setup if no loja yet
  useEffect(() => {
    if (!loja.isLoading && !loja.data) {
      navigate("/dashboard/convertiq/setup", { replace: true });
    }
  }, [loja.isLoading, loja.data, navigate]);

  const isMock = funilPage.data?.source === "none";
  const raw: MetricasFunil = funilPage.data?.metricas
    ? {
        visitantes:            funilPage.data.metricas.visitantes,
        visualizacoes_produto: funilPage.data.metricas.visualizacoes_produto,
        adicionou_carrinho:    funilPage.data.metricas.adicionou_carrinho,
        iniciou_checkout:      funilPage.data.metricas.iniciou_checkout,
        compras:               funilPage.data.metricas.compras,
        receita:               funilPage.data.metricas.receita,
        fonte:                 funilPage.data.source === "ga4" ? "ga4" : "real",
      }
    : EMPTY_FUNIL_METRICAS;

  const meta    = Number(config.data?.meta_conversao  ?? DEFAULT_CONFIG.meta_conversao);
  const storeRow = loja.data as (StoreRow & { ticket_medio?: number }) | undefined;
  const ticket  = Number(storeRow?.ticket_medio ?? DEFAULT_CONFIG.ticket_medio);
  const { taxaConversao, perdaMensal, etapas, maiorGargalo } = calcFunil(raw, meta, ticket);

  // Biggest drop index (0-based among steps 1-4)
  const maxDropIdx = etapas.reduce((mi, e, i) => i > 0 && e.dropPct > (etapas[mi]?.dropPct ?? 0) ? i : mi, 1);

  async function handleGerar() {
    if (!loja.data) return;
    setGenerating(true);
    try {
      await gerarDiag.mutateAsync({
        lojaId: loja.data.id,
        metricas: raw,
        metaConversao: meta,
      });
      toast.success("Diagnóstico gerado com sucesso!");
      navigate(`/dashboard/funil/diagnostico`);
    } catch { /* error toast already shown in hook */ } finally {
      setGenerating(false);
    }
  }

  async function handleSaveManual(m: MetricasFunil) {
    if (!loja.data) return;
    await saveMet.mutateAsync({ lojaId: loja.data.id, metricas: m });
    setShowManual(false);
    funilPage.refetch();
  }

  if (loja.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">ConvertIQ</h1>
            {loja.data && (
              <p className="text-xs text-muted-foreground">
                {(loja.data as StoreRow).name} · {(loja.data as StoreRow).segment ?? "—"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period toggle */}
          <div className="flex bg-muted rounded-lg p-0.5">
            {(["7d", "30d", "90d"] as Periodo[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >{p}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowManual(true)}>
            <Pencil className="w-3.5 h-3.5" /> Editar dados
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleGerar} disabled={generating}>
            <Sparkles className="w-3.5 h-3.5" /> Gerar diagnóstico IA
          </Button>
        </div>
      </div>

      {/* Mock badge */}
      {isMock && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
          <span>📊</span>
          <span className="text-amber-600 dark:text-amber-400">Configure GA4 para ver dados reais — <button className="underline" onClick={() => setShowManual(true)}>inserir manualmente</button> ou conectar GA4 nas configurações.</span>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Conversão atual */}
        <div className="bg-card border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">Conversão atual</p>
          <p className="text-3xl font-extrabold font-mono">{taxaConversao}%</p>
          <p className="text-xs text-muted-foreground mt-1">Meta: {meta}%</p>
          <span className={cn("inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-full",
            taxaConversao >= meta ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
          )}>
            {taxaConversao >= meta ? "✓ Acima da meta" : `▼ ${(meta - taxaConversao).toFixed(2)}pp abaixo da meta`}
          </span>
        </div>

        {/* Perda estimada */}
        <div className="bg-card border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">Perda estimada/mês</p>
          <p className="text-3xl font-extrabold font-mono text-red-500">
            R$ {perdaMensal.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">vs. se atingisse a meta</p>
          {perdaMensal > 0 && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
              ↑ Recuperável
            </span>
          )}
        </div>

        {/* Visitantes */}
        <div className="bg-card border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">Visitantes</p>
          <p className="text-3xl font-extrabold font-mono">{raw.visitantes.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground mt-1">últimos {periodo}</p>
        </div>

        {/* Maior gargalo */}
        <div className="bg-card border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">Maior gargalo</p>
          <p className="text-base font-bold leading-tight">{maiorGargalo.label}</p>
          <p className="text-xs text-muted-foreground mt-1">Apenas {(100 - maiorGargalo.drop).toFixed(0)}% continuam</p>
          <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 animate-pulse">
            Crítico
          </span>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-card border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold">Funil de Conversão</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Onde você está perdendo clientes</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => void 0}>
            <RefreshCw className="w-3.5 h-3.5" />
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

        {/* Quick analysis */}
        <div className="mt-5 p-4 rounded-xl bg-muted/40 border">
          <p className="text-sm font-medium mb-1">🔍 Análise rápida</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A maior queda está em <strong className="text-foreground">{maiorGargalo.label}</strong> ({maiorGargalo.drop.toFixed(0)}% de abandono).
            {raw.compras > 0 && raw.iniciou_checkout > 0 && (
              <> Um visitante que chega ao checkout tem muito mais intenção de compra que a média — essa perda representa <strong className="text-foreground">R$ {Math.round((raw.iniciou_checkout - raw.compras) * ticket * 0.1).toLocaleString("pt-BR")}</strong> de receita potencial.</>
            )}
          </p>
        </div>
      </div>

      {/* Last diagnostic summary */}
      {lastDiag.data && (
        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Último Diagnóstico</h2>
            <span className="text-xs text-muted-foreground">
              {new Date(lastDiag.data.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{lastDiag.data.resumo}</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Score {lastDiag.data.score}/100</span>
            </div>
            <Link to="/dashboard/funil/diagnostico" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline ml-auto">
              Ver diagnóstico completo <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* No diagnostic CTA */}
      {!lastDiag.data && !lastDiag.isLoading && (
        <div className="bg-card border rounded-2xl p-6 text-center">
          <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="font-semibold mb-1">Nenhum diagnóstico ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">Gere um diagnóstico com IA para identificar os gargalos do seu funil</p>
          <Button onClick={handleGerar} disabled={generating} className="gap-2">
            <Sparkles className="w-4 h-4" /> Gerar diagnóstico com IA
          </Button>
        </div>
      )}
    </div>
  );
}
