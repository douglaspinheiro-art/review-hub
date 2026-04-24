import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, TrendingUp, AlertCircle, Loader2, Sparkles, ArrowRight, Check, Lock, Percent, Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CHSGauge } from "@/components/dashboard/CHSGauge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { recommendPlan } from "@/lib/plan-recommendation";
import { PLANS } from "@/lib/pricing-constants";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";
import { useMercadoPagoCheckout } from "@/hooks/useMercadoPagoCheckout";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import { FreshnessIndicator } from "@/components/dashboard/trust/FreshnessIndicator";
import type { DataSource } from "@/lib/data-provenance";
import { estimatePeerPercentile, type EcommerceVerticalKey } from "@/lib/industry-benchmarks";
import { RecommendationsSimulator, ProjectionPreview } from "@/components/resultado/RecommendationsSimulator";
import { pickAbVariant } from "@/lib/ab-variant";

type DiagnosticData = {
  resumo?: string;
  perda_principal?: string;
  percentual_explicado?: number;
  problemas?: Array<{
    titulo: string;
    descricao: string;
    severidade: string;
    impacto_reais: number;
  }>;
  recomendacoes?: Array<{
    titulo: string;
    descricao: string;
    esforco: string;
    impacto_pp: number;
    prazo_semanas: number;
    tipo: string;
  }>;
  /** Campo real retornado pela edge `gerar-diagnostico` (e pelo fallback local). */
  recomendacoes_ux?: Array<{
    titulo: string;
    descricao: string;
    esforco: string;
    impacto_pp: number;
    prazo_semanas: number;
    tipo: string;
  }>;
  oportunidades?: Array<{
    titulo: string;
    descricao: string;
    potencial_reais?: number;
    janela_dias?: number;
    segmento?: string;
    evento_sazonal?: string | null;
  }>;
  chs_breakdown?: {
    conversao?: number;
    funil?: number;
    produtos?: number;
    mobile?: number;
  };
  forecast_30d?: {
    minimo?: number;
    maximo?: number;
    com_prescricoes?: number;
    com_ux_fixes?: number;
  };
  meta?: {
    fallback_mode?: boolean;
    parse_retry?: boolean;
    cached?: boolean;
    confidence?: {
      real_signals_pct?: number;
      data_window_days?: number;
      last_sync_at?: string;
      field_provenance?: Record<string, "real" | "estimated">;
    };
    generated_at?: string;
  };
  data_quality?: {
    ga4_diff_pct?: number | null;
  };
};

/** Parse seguro do sessionStorage; retorna null em qualquer falha. */
function safeParseFunnel(): {
  ticket_medio?: number;
  visitantes?: number;
  pedido?: number;
  meta_conversao?: number;
  taxa_conversao?: number;
  segmento?: string;
} | null {
  try {
    const raw = sessionStorage.getItem("ltv_funnel_data");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function Resultado() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isActive = profile?.subscription_status === "active";

  const [loading, setLoading] = useState(true);
  const [missingDiagnostic, setMissingDiagnostic] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [chs, setChs] = useState(0);
  const [chsLabel, setChsLabel] = useState("Regular");
  const [storeName, setStoreName] = useState("Sua Loja");
  const [persistedPlan, setPersistedPlan] = useState<"growth" | "scale" | null>(null);
  // Fonte canônica de funil quando o sessionStorage está vazio (ex.: usuário voltou a /resultado em outra aba/dispositivo).
  const [dbFunnel, setDbFunnel] = useState<{
    visitantes?: number;
    pedido?: number;
    ticket_medio?: number;
  } | null>(null);

  /** Aguarda o insert em `diagnostics_v3` (pós-/analisando) sem mandar o usuário para /dashboard/diagnostico (paywall). */
  const POLL_MS = 1000;
  const POLL_MAX_ATTEMPTS = 45;

  useEffect(() => {
    let cancelled = false;

    async function fetchDiagnostic() {
      if (!user?.id) return;

      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if ((storeData as { name?: string } | null)?.name) {
        setStoreName((storeData as { name: string }).name);
      }

      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;

        const { data: diagData } = await supabase
          .from("diagnostics_v3")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (diagData) {
          setDiagnostic(diagData.diagnostic_json as DiagnosticData);
          setDiagnosticId((diagData as { id?: string }).id ?? null);
          setChs(diagData.chs ?? 47);
          setChsLabel(diagData.chs_label ?? "Regular");
          const rp = (diagData as { recommended_plan?: string | null }).recommended_plan;
          if (rp === "growth" || rp === "scale") setPersistedPlan(rp);
          // Backfill canônico do funil a partir do banco (cobre o caso de sessionStorage vazio).
          const { data: fmRow } = await supabase
            .from("funnel_metrics")
            .select("visitantes,compras,receita")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fmRow) {
            const v = Number((fmRow as { visitantes?: number }).visitantes) || 0;
            const c = Number((fmRow as { compras?: number }).compras) || 0;
            const r = Number((fmRow as { receita?: number }).receita) || 0;
            setDbFunnel({
              visitantes: v > 0 ? v : undefined,
              pedido: c > 0 ? c : undefined,
              ticket_medio: c > 0 && r > 0 ? Math.round(r / c) : undefined,
            });
          }
          setLoading(false);
          setMissingDiagnostic(false);
          void trackFunnelEvent({
            event: "diagnostic_viewed",
            metadata: { has_diagnostic: true, chs: diagData?.chs ?? null },
          });
          return;
        }

        if (attempt < POLL_MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      }

      if (!cancelled) {
        setMissingDiagnostic(true);
        setLoading(false);
        void trackFunnelEvent({
          event: "diagnostic_viewed",
          metadata: { has_diagnostic: false, reason: "not_found_after_poll" },
        });
      }
    }

    void fetchDiagnostic();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Compute loss from funnel data — parse seguro evita quebra por payload corrompido.
  const funnel = safeParseFunnel();
  // Prioridade: sessionStorage (acabou de gerar) → banco (funnel_metrics) → null (sem mock fictício).
  const ticketMedio = funnel?.ticket_medio || dbFunnel?.ticket_medio || 250;
  const visitantesNum = funnel?.visitantes || dbFunnel?.visitantes || 0;
  const pedidosNum = funnel?.pedido ?? dbFunnel?.pedido ?? 0;
  const hasTaxaConversaoField = typeof funnel?.taxa_conversao === "number";
  const derivedCvrPct =
    visitantesNum > 0 ? (pedidosNum / visitantesNum) * 100 : null;
  const taxaConversaoAtual =
    derivedCvrPct !== null
      ? derivedCvrPct
      : (hasTaxaConversaoField ? Number(funnel?.taxa_conversao) : 1.4);

  const rawBench = Number(funnel?.meta_conversao);
  /** Payloads antigos gravavam a CVR medida em meta_conversao; detectar e usar default de benchmark. */
  let benchmarkConversao = 2.5;
  if (hasTaxaConversaoField) {
    benchmarkConversao = Number.isFinite(rawBench) ? rawBench : 2.5;
  } else if (
    derivedCvrPct !== null &&
    Number.isFinite(rawBench) &&
    Math.abs(rawBench - derivedCvrPct) < 0.2
  ) {
    benchmarkConversao = 2.5;
  } else if (Number.isFinite(rawBench)) {
    benchmarkConversao = rawBench;
  }

  const perdaMensal = Math.max(
    0,
    Math.round(((benchmarkConversao / 100) - (taxaConversaoAtual / 100)) * visitantesNum * ticketMedio),
  );

  const computed = recommendPlan({
    chs,
    perdaMensal,
    problemas: diagnostic?.problemas,
  });
  // Prefer persisted recommendation from DB (consistency across /resultado and /planos)
  const recommendation = persistedPlan
    ? { tier: persistedPlan, reason: computed.reason }
    : computed;
  const recommendedPlan = PLANS[recommendation.tier];
  const { open: openCheckout } = useMercadoPagoCheckout();

  // 3.1 — Posicionamento percentil contra peers do segmento.
  const verticalKey: EcommerceVerticalKey = (() => {
    const seg = (funnel?.segmento ?? "").toLowerCase();
    if (seg.includes("moda")) return "fashion";
    if (seg.includes("belez")) return "beauty";
    if (seg.includes("supl")) return "supplements";
    if (seg.includes("pet")) return "pets";
    return "generic";
  })();
  const peer = estimatePeerPercentile(taxaConversaoAtual, verticalKey);

  // 4.2 — A/B test do copy do CTA. Variante A = copy 3.3 atual (genérica por CHS).
  // Variante B = copy concreta usando perda_estimada quando há perda relevante.
  const ctaVariant = pickAbVariant("resultado_cta_copy_v1", user?.id ?? null);
  const ctaCopyA = chs >= 70
    ? `Manter liderança com ${recommendedPlan.name}`
    : chs >= 40
    ? `Acelerar resultados com ${recommendedPlan.name}`
    : `Resgatar receita perdida com ${recommendedPlan.name}`;
  const ctaCopyB = perdaMensal > 1000
    ? `Recuperar R$ ${perdaMensal.toLocaleString("pt-BR")}/mês`
    : ctaCopyA;
  const ctaCopy = ctaVariant === "B" ? ctaCopyB : ctaCopyA;
  const ctaUrgencyLabel = chs < 40 ? "Em risco" : chs < 70 ? "Há espaço para crescer" : "Ótimo desempenho";

  useEffect(() => {
    if (!loading && diagnostic) {
      void trackFunnelEvent({
        event: "plan_recommended",
        recommendedPlan: recommendation.tier,
        metadata: { chs, perdaMensal },
      });
      void trackFunnelEvent({
        event: "resultado_viewed",
        recommendedPlan: recommendation.tier,
        metadata: {
          chs,
          perdaMensal,
          peer_percentile: peer.percentile,
          vertical: verticalKey,
          fallback_mode: Boolean(diagnostic?.meta?.fallback_mode),
          ab_cta_variant: ctaVariant,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, recommendation.tier]);

  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleSubscribe = (planKey: "starter" | "growth" | "scale") => {
    if (checkoutLoading) return;
    setCheckoutLoading(planKey);
    void trackFunnelEvent({
      event: "resultado_checkout_started",
      recommendedPlan: recommendation.tier,
      selectedPlan: planKey,
      metadata: { chs, billingCycle, peer_percentile: peer.percentile, ab_cta_variant: ctaVariant },
    });
    try {
      openCheckout({ planKey, billingCycle, source: "resultado_inline" });
    } finally {
      setTimeout(() => setCheckoutLoading(null), 600);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground max-w-sm">Carregando seu diagnóstico…</p>
      </div>
    );
  }

  if (missingDiagnostic || !diagnostic) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center gap-6 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <div className="space-y-2 max-w-md">
          <h1 className="text-2xl font-black font-syne tracking-tighter">Diagnóstico ainda não disponível</h1>
          <p className="text-sm text-muted-foreground">
            Não encontramos seu diagnóstico salvo. Isso pode acontecer se a análise ainda estiver finalizando ou se houve uma falha ao salvar.
          </p>
        </div>
        <Button
          size="lg"
          className="font-black rounded-xl gap-2"
          onClick={() => navigate("/analisando", { replace: true })}
        >
          Tentar gerar novamente <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  const problemas = diagnostic?.problemas || [];
  // A edge `gerar-diagnostico` (e o fallback local) gravam em `recomendacoes_ux`.
  // Mantemos `recomendacoes` como fallback para diagnósticos antigos / payloads alternativos.
  const recomendacoes =
    diagnostic?.recomendacoes_ux?.length
      ? diagnostic.recomendacoes_ux
      : diagnostic?.recomendacoes || [];
  const oportunidades = diagnostic?.oportunidades || [];
  const forecast = diagnostic?.forecast_30d;
  const meta = diagnostic?.meta;
  const realPct = meta?.confidence?.real_signals_pct ?? 0;
  const dataWindowDays = meta?.confidence?.data_window_days ?? 30;
  const lastSyncAt = meta?.confidence?.last_sync_at ?? meta?.generated_at ?? null;
  const fallbackMode = Boolean(meta?.fallback_mode);
  const cached = Boolean(meta?.cached);
  const ga4Diff = diagnostic?.data_quality?.ga4_diff_pct ?? null;
  const confidenceSource: DataSource = realPct >= 70 ? "real" : realPct >= 30 ? "derived" : "estimated";

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-20">
      {/* Top Header */}
      <div className="border-b border-[#1E1E2E] bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
            <span className="font-bold tracking-tighter">LTV BOOST</span>
          </div>
          {isActive ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="font-bold rounded-xl h-9 gap-1"
            >
              Ir para o painel <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                void trackFunnelEvent({
                  event: "resultado_cta_clicked",
                  recommendedPlan: recommendation.tier,
                  metadata: { chs, location: "header", urgency: ctaUrgencyLabel, ab_cta_variant: ctaVariant },
                });
                document.getElementById("planos-inline")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="font-bold rounded-xl h-9 gap-1"
            >
              {ctaCopy} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-12 space-y-16">
        {/* CHS Block */}
        <div className="text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black font-syne tracking-tighter uppercase italic">
              Diagnóstico: {storeName}
            </h1>
            <p className="text-muted-foreground text-sm">
              Baseado em {visitantesNum.toLocaleString("pt-BR")} visitantes · {pedidosNum} pedidos · Taxa de conversão {taxaConversaoAtual.toFixed(2)}%
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <DataSourceBadge
                source={confidenceSource}
                origin={`${realPct}% sinais reais · janela ${dataWindowDays}d`}
                updatedAt={lastSyncAt}
                note={fallbackMode ? "Diagnóstico gerado em modo fallback (IA indisponível)." : undefined}
              />
              {lastSyncAt && (
                <FreshnessIndicator updatedAt={lastSyncAt} slaMinutes={60 * 24} label="Sincronizado" />
              )}
              {fallbackMode && (
                <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wide">
                  Modo fallback
                </Badge>
              )}
              {cached && (
                <Badge className="bg-muted/40 text-muted-foreground border border-border text-[10px] font-bold uppercase tracking-wide">
                  Cache 5min
                </Badge>
              )}
              {diagnosticId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={shareLoading}
                  onClick={async () => {
                    if (!diagnosticId) return;
                    setShareLoading(true);
                    try {
                      const token = crypto.randomUUID().replace(/-/g, "");
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const { error } = await (supabase as any)
                        .from("diagnostic_share_tokens")
                        .insert({
                          token,
                          diagnostic_id: diagnosticId,
                          user_id: user?.id,
                          store_name: storeName,
                        });
                      if (error) throw error;
                      const url = `${window.location.origin}/d/${token}`;
                      await navigator.clipboard.writeText(url);
                      void trackFunnelEvent({
                        event: "diagnostic_share_link_created",
                        metadata: { diagnostic_id: diagnosticId, token },
                      });
                      // Toast leve via alert nativo se sonner não estiver no escopo aqui
                      const { toast } = await import("sonner");
                      toast.success("Link copiado!", { description: "Compartilhe seu diagnóstico." });
                    } catch (e) {
                      const { toast } = await import("sonner");
                      toast.error("Não foi possível gerar o link.");
                    } finally {
                      setShareLoading(false);
                    }
                  }}
                  className="h-7 gap-1.5 text-[10px] font-bold uppercase tracking-wide rounded-full"
                >
                  <Share2 className="w-3 h-3" />
                  {shareLoading ? "Gerando..." : "Compartilhar"}
                </Button>
              )}
            </div>
            {typeof ga4Diff === "number" && Math.abs(ga4Diff) > 5 && (
              <p className="text-[11px] text-amber-400 max-w-md mx-auto">
                GA4 reporta {ga4Diff > 0 ? "+" : ""}{Math.round(ga4Diff)}% {ga4Diff > 0 ? "a mais" : "a menos"} pedidos que sua loja.{" "}
                <button
                  onClick={() => navigate("/dashboard/integracoes")}
                  className="underline hover:text-amber-300"
                >
                  Reconciliar em integrações
                </button>
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <CHSGauge
              score={chs}
              label={chsLabel}
              className="w-full max-w-sm border-0 bg-transparent"
            />
          </div>
        </div>

        {/* Loss Block */}
        {perdaMensal > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <AlertCircle className="w-16 h-16 text-red-500" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-widest text-red-500/80">Você está perdendo</p>
              <div className="text-5xl font-black font-jetbrains text-red-500 tracking-tighter">
                R$ {perdaMensal.toLocaleString("pt-BR")} <span className="text-lg opacity-50">/ mês</span>
              </div>
              <p className="text-xs text-muted-foreground">vs. benchmark do setor ({benchmarkConversao}%)</p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-red-500/10">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Sua CVR</p>
                <p className="text-lg font-black">{taxaConversaoAtual.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Benchmark setor</p>
                <p className="text-lg font-black text-emerald-500">{benchmarkConversao}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Perda/dia</p>
                <p className="text-lg font-black text-red-500">R$ {Math.round(perdaMensal / 30).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </div>
        )}

        {/* 3.1 — Posicionamento contra peers do segmento */}
        <div className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-6 md:p-8 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Você vs. {peer.distribution.label.toLowerCase()} no Brasil
              </p>
              <h3 className="text-2xl md:text-3xl font-black font-syne tracking-tighter">
                Percentil <span className="text-primary">{peer.percentile}</span> do seu segmento
              </h3>
              <p className="text-xs text-muted-foreground max-w-md">
                {peer.percentile >= 75
                  ? "Você está acima da média — foco em manter a liderança e aumentar LTV."
                  : peer.percentile >= 50
                  ? "Você está acima da mediana, mas longe do top 25%. Há receita parada na mesa."
                  : peer.percentile >= 25
                  ? `${100 - peer.percentile}% das lojas do seu segmento convertem mais que você.`
                  : "Você está no quartil inferior — recuperação rápida possível com ajustes pontuais."}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Sua CVR</p>
              <p className="text-2xl font-black font-jetbrains">{taxaConversaoAtual.toFixed(2)}%</p>
            </div>
          </div>

          {/* Régua de percentis */}
          <div className="space-y-2">
            <div className="relative h-2.5 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full"
                style={{ width: "100%" }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0A0A0F] shadow-lg"
                style={{ left: `calc(${peer.percentile}% - 7px)` }}
              />
            </div>
            <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-mono">
              <span>p25 · {peer.distribution.p25}%</span>
              <span className="text-center">mediana · {peer.distribution.median}%</span>
              <span className="text-center">p75 · {peer.distribution.p75}%</span>
              <span className="text-right text-emerald-500">top 10% · {peer.distribution.top10}%</span>
            </div>
          </div>

          {peer.percentile < 75 && (
            <div className="pt-4 border-t border-border/30 text-xs text-muted-foreground">
              Para alcançar o <span className="text-emerald-500 font-bold">top 25%</span> ({peer.distribution.p75}% CVR),
              você precisaria de <span className="text-white font-bold">+{Math.max(0, peer.distribution.p75 - taxaConversaoAtual).toFixed(2)}pp</span>{" "}
              de conversão — equivale a <span className="text-emerald-500 font-bold">R$ {Math.max(0, Math.round(((peer.distribution.p75 - taxaConversaoAtual) / 100) * visitantesNum * ticketMedio)).toLocaleString("pt-BR")}/mês</span> a mais.
            </div>
          )}
        </div>

        {/* AI Summary */}
        {diagnostic?.resumo && (
          <div className="bg-primary/5 border-l-4 border-primary rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Análise da IA</span>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{diagnostic.resumo}</p>
            {diagnostic.perda_principal && (
              <p className="text-xs text-muted-foreground">
                Gargalo principal: <strong className="text-white">{diagnostic.perda_principal}</strong>
                {diagnostic.percentual_explicado && (
                  <Badge className="ml-2 bg-primary/20 text-primary border-none text-[9px]">
                    {diagnostic.percentual_explicado}% das perdas explicadas
                  </Badge>
                )}
              </p>
            )}
          </div>
        )}

        {/* Problems */}
        {problemas.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" /> Problemas prioritários
            </h2>
            <div className="space-y-4">
              {problemas.map((p, i) => {
                const locked = !isActive && i >= 1;
                const card = (
                  <div className={cn(
                    "border rounded-2xl p-6 transition-all",
                    p.severidade === "critico"
                      ? "border-red-500/30 bg-red-500/5"
                      : p.severidade === "alto"
                      ? "border-orange-500/30 bg-orange-500/5"
                      : "border-yellow-500/30 bg-yellow-500/5"
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className={cn("text-[10px] font-bold tracking-widest px-2 py-0.5",
                        p.severidade === "critico" ? "text-red-500 border-red-500/50" :
                        p.severidade === "alto" ? "text-orange-500 border-orange-500/50" :
                        "text-yellow-500 border-yellow-500/50"
                      )}>
                        {p.severidade === "critico" ? "CRÍTICO" : p.severidade === "alto" ? "ALTO" : "MÉDIO"}
                      </Badge>
                      <span className="text-sm font-bold text-red-500">R$ {p.impacto_reais?.toLocaleString("pt-BR")}/mês</span>
                    </div>
                    <h3 className="text-lg font-bold mb-2">{p.titulo}</h3>
                    <p className="text-sm text-muted-foreground">{p.descricao}</p>
                  </div>
                );

                if (!locked) return <div key={i}>{card}</div>;

                return (
                  <div key={i} className="relative" aria-hidden="true">
                    <div className="filter blur-[6px] opacity-60 pointer-events-none select-none">
                      {card}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A0F]/70 to-[#0A0A0F]/90 rounded-2xl pointer-events-none" />
                  </div>
                );
              })}

              {!isActive && problemas.length > 1 && (() => {
                const lockedCount = problemas.length - 1;
                const lockedImpact = problemas.slice(1).reduce((sum, p) => sum + (p.impacto_reais ?? 0), 0);
                return (
                  <div className="relative -mt-48 z-10 border border-emerald-500/30 bg-[#0F1614]/95 backdrop-blur-xl rounded-2xl p-6 md:p-8 text-center space-y-4 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                      <Lock className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg md:text-xl font-black font-syne tracking-tighter">
                        Veja os outros {lockedCount} gargalos identificados
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        +R$ {lockedImpact.toLocaleString("pt-BR")}/mês em receita perdida bloqueados nestes itens
                      </p>
                    </div>
                    <Button
                      onClick={() => document.getElementById("planos-inline")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase text-xs px-6 h-11 border-0 shadow-lg shadow-emerald-900/30"
                    >
                      <Lock className="w-3.5 h-3.5 mr-2" /> Desbloquear diagnóstico completo
                    </Button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recomendacoes.length > 0 && (
          <RecommendationsSimulator
            recomendacoes={recomendacoes}
            visitantes={visitantesNum}
            ticketMedio={ticketMedio}
            cvrAtualPct={taxaConversaoAtual}
          />
        )}


        {/* Inline checkout — 3 plans, monthly/annual toggle, recommended highlighted */}
        {oportunidades.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold font-syne uppercase tracking-tighter flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Oportunidades adicionais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {oportunidades.map((o, i) => (
                <div key={i} className="border border-primary/20 bg-primary/5 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{o.titulo}</h3>
                    {o.potencial_reais ? (
                      <span className="text-xs font-black text-emerald-500">
                        +R$ {o.potencial_reais.toLocaleString("pt-BR")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{o.descricao}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                    {o.janela_dias ? <span>Janela {o.janela_dias}d</span> : null}
                    {o.segmento ? <Badge variant="outline" className="text-[9px]">{o.segmento}</Badge> : null}
                    {o.evento_sazonal ? <Badge className="text-[9px] bg-amber-500/15 text-amber-500 border-none">{o.evento_sazonal}</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {forecast && (forecast.minimo || forecast.maximo || forecast.com_prescricoes) && (
          <div className="border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-3xl p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h2 className="text-xl font-bold font-syne uppercase tracking-tighter">Projeção 30 dias</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-[#1E1E2E] bg-[#13131A] p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Cenário base</p>
                <p className="text-2xl font-black font-jetbrains text-white">
                  R$ {(forecast.minimo ?? 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">sem ações novas</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center ring-1 ring-emerald-500/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2">Com prescrições</p>
                <p className="text-2xl font-black font-jetbrains text-emerald-500">
                  +R$ {(forecast.com_prescricoes ?? 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">campanhas ativadas</p>
              </div>
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">Com fixes UX</p>
                <p className="text-2xl font-black font-jetbrains text-blue-400">
                  +R$ {(forecast.com_ux_fixes ?? 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">após melhorias</p>
              </div>
            </div>
            {forecast.maximo ? (
              <p className="text-[11px] text-muted-foreground text-center">
                Cenário máximo combinando todas as ações: <span className="text-emerald-500 font-bold">R$ {forecast.maximo.toLocaleString("pt-BR")}</span>
              </p>
            ) : null}
          </div>
        )}

        {!isActive && diagnostic && (
          <div id="planos-inline" className="space-y-8 scroll-mt-20">
            {/* Price anchor — ROI vs perda mensal */}
            {perdaMensal > 0 && (() => {
              const planPrice = recommendedPlan.base;
              const ratio = Math.max(1, Math.round(perdaMensal / planPrice));
              const paybackDays = Math.max(1, Math.round((planPrice / perdaMensal) * 30));
              return (
                <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-3xl p-6 md:p-8 text-center space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">Faça as contas</p>
                  <p className="text-lg md:text-2xl font-bold leading-snug max-w-3xl mx-auto">
                    Você está perdendo <span className="text-red-500 font-black">R$ {perdaMensal.toLocaleString("pt-BR")}/mês</span>. O {recommendedPlan.name} custa <span className="text-emerald-500 font-black">R$ {planPrice.toLocaleString("pt-BR")}/mês</span> — <span className="font-black">{ratio}x menos</span>.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Payback estimado em <span className="text-white font-bold">{paybackDays} dia{paybackDays > 1 ? "s" : ""}</span> · cada dia sem agir custa <span className="text-red-500 font-bold">R$ {Math.round(perdaMensal / 30).toLocaleString("pt-BR")}</span>
                  </p>
                </div>
              );
            })()}

            <div className="text-center space-y-3">
              <Badge className="bg-primary/20 text-primary border-none text-[10px] font-black tracking-widest uppercase">
                Recomendamos {recommendedPlan.name} para sua loja
              </Badge>
              <h2 className="text-3xl md:text-4xl font-black font-syne tracking-tighter">
                Escolha seu plano e comece agora
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                {recommendation.reason}
              </p>

              <p className="text-[11px] text-white/50 mt-3 max-w-md mx-auto">
                Mensalidade fixa + Success Fee variável <span className="text-emerald-500 font-semibold">só sobre o que recuperarmos</span>
              </p>

              {/* Billing toggle */}
              <div className="inline-flex items-center gap-1 bg-[#13131A] border border-[#1E1E2E] rounded-full p-1 mt-4">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-full transition-all",
                    billingCycle === "monthly" ? "bg-white text-black" : "text-muted-foreground hover:text-white"
                  )}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setBillingCycle("annual")}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5",
                    billingCycle === "annual" ? "bg-white text-black" : "text-muted-foreground hover:text-white"
                  )}
                >
                  Anual
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.5 rounded-full",
                    billingCycle === "annual" ? "bg-emerald-500/20 text-emerald-700" : "bg-emerald-500/20 text-emerald-500"
                  )}>
                    -20%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["starter", "growth", "scale"] as const).map((key) => {
                const plan = PLANS[key];
                const isRecommended = recommendation.tier === key;
                const monthlyPrice = billingCycle === "annual"
                  ? Math.round(plan.base * 0.8)
                  : plan.base;
                const isLoading = checkoutLoading === key;

                return (
                  <div
                    key={key}
                    className={cn(
                      "relative border rounded-2xl p-6 flex flex-col gap-5 transition-all",
                      isRecommended
                        ? "border-emerald-500/50 bg-emerald-500/5 ring-2 ring-emerald-500/30 md:scale-[1.02]"
                        : "border-[#1E1E2E] bg-[#13131A]"
                    )}
                  >
                    {isRecommended && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black border-none text-[10px] font-black tracking-widest uppercase shadow-lg shadow-emerald-500/30">
                        ⭐ Recomendado para você
                      </Badge>
                    )}

                    <div className="space-y-1">
                      <div className="text-2xl">{plan.emoji}</div>
                      <h3 className="text-xl font-black font-syne">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.audience}</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black font-jetbrains">
                          R$ {monthlyPrice.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-xs text-muted-foreground">/mês</span>
                      </div>
                      {billingCycle === "annual" && (
                        <p className="text-[10px] text-emerald-500 font-bold">
                          economize R$ {((plan.base - monthlyPrice) * 12).toLocaleString("pt-BR")}/ano
                        </p>
                      )}
                      {(() => {
                        const rate = plan.successFeeRate;
                        const ratePct = (rate * 100).toFixed(rate < 0.02 ? 1 : 0);
                        const starterRate = PLANS.starter.successFeeRate;
                        const diffPp = ((starterRate - rate) * 100).toFixed(starterRate - rate < 0.02 ? 1 : 0);
                        const showSavings = key !== "starter";
                        return (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/55 cursor-help">
                                  <Percent className="w-3 h-3 text-emerald-500 shrink-0" />
                                  <span>
                                    + <span className="text-white/80 font-semibold">{ratePct}%</span> sobre receita recuperada
                                    <span className="text-white/40"> · Success Fee</span>
                                  </span>
                                  {showSavings && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                                      -{diffPp}pp vs Starter
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                                Você só paga essa taxa sobre o faturamento que o LTV Boost recupera. Sem recuperação, sem fee.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>

                    <ul className="space-y-2 text-xs flex-1">
                      {plan.landingFeatures.slice(0, 5).map((f: string) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", isRecommended ? "text-emerald-500" : "text-white/60")} />
                          <span className="text-white/80">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handleSubscribe(key)}
                      disabled={!!checkoutLoading}
                      size="lg"
                      className={cn(
                        "w-full h-12 text-sm font-black rounded-xl gap-2 group",
                        isRecommended
                          ? "bg-gradient-to-r from-emerald-500 to-blue-600 shadow-lg shadow-emerald-500/20 hover:scale-[1.01] transition-all"
                          : "bg-white text-black hover:bg-white/90"
                      )}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Abrindo checkout...
                        </>
                      ) : (
                        <>
                          Assinar {plan.name}
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Active user — invite to dashboard instead of upsell */}
        {isActive && diagnostic && (
          <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-3xl p-8 space-y-4 text-center">
            <Badge className="bg-emerald-500/20 text-emerald-500 border-none text-[10px] font-black tracking-widest uppercase">
              Plano ativo
            </Badge>
            <h2 className="text-2xl font-black font-syne tracking-tighter">
              Seu painel já está liberado
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Use o diagnóstico como guia: cada problema acima vira uma campanha pronta no painel.
            </p>
            <Button
              onClick={() => navigate("/dashboard")}
              size="lg"
              className="font-black rounded-xl gap-2"
            >
              Ir para o painel <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
