import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";

/** meta_conversao no funil = benchmark de setor; taxa_conversao = CVR medida (payload novo). */
type FunnelPayload = {
  visitantes: number;
  produto_visto: number;
  carrinho: number;
  checkout: number;
  pedido: number;
  ticket_medio: number;
  meta_conversao?: number;
  taxa_conversao?: number;
  segmento?: string;
  store_id?: string | null;
  field_provenance?: Record<string, "real" | "estimated">;
  real_signals_pct?: number;
  data_source_summary?: { ga4?: boolean; loja?: boolean; manual?: boolean };
};

function benchmarkForDiagnostics(funnel: FunnelPayload): number {
  const conversaoPct =
    funnel.pedido > 0 && funnel.visitantes > 0
      ? (funnel.pedido / funnel.visitantes) * 100
      : 0;
  const raw = Number(funnel.meta_conversao) || 2.5;
  if (typeof funnel.taxa_conversao === "number") return raw;
  if (conversaoPct > 0 && Math.abs(raw - conversaoPct) < 0.2) return 2.5;
  return raw;
}

const STEPS = [
  { label: "Estabelecendo conexão segura...", ms: 1200 },
  { label: "Mapeando transações dos últimos 6 meses...", ms: 1800 },
  { label: "Identificando clientes únicos multicanal...", ms: 1500 },
  { label: "Detectando carrinhos abandonados (últimas 48h)...", ms: 2000, highlight: true },
  { label: "Calculando Conversion Health Score (CHS)...", ms: 1500 },
  { label: "Cruzando com benchmarks do segmento...", ms: 1500 },
  { label: "Quantificando receita perdida em gargalos de UX...", ms: 1200 },
  { label: "Finalizando diagnóstico prescritivo...", ms: 2500, special: true },
];

export default function Analisando() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [diagnosticCalled, setDiagnosticCalled] = useState(false);
  const navigatedToResultadoRef = useRef(false);
  const realProgressRef = useRef(false);

  useEffect(() => {
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    let progressChannelRef: ReturnType<typeof supabase.channel> | null = null;

    function goToResultado(delayMs = 800) {
      if (navigatedToResultadoRef.current) return;
      navigatedToResultadoRef.current = true;
      setProgress(100);
      // Telemetria 4.1: marca conclusão da etapa /analisando.
      void trackFunnelEvent({
        event: "analisando_completed",
        metadata: { delay_ms: delayMs },
      });
      setTimeout(() => navigate("/resultado", { replace: true }), delayMs);
    }

    async function setupRealtimeAndDiagnose() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      // Telemetria 4.1: entrou na tela de análise.
      void trackFunnelEvent({
        event: "analisando_entered",
        metadata: {},
      });

      // Guard: paid users (active OR pending_activation) never sit on /analisando.
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", userId)
        .maybeSingle();
      const subStatus = (profileRow as { subscription_status?: string } | null)?.subscription_status;
      if (subStatus === "active" || subStatus === "pending_activation") {
        navigatedToResultadoRef.current = true;
        navigate("/dashboard", { replace: true });
        return;
      }

      // 1. Listen for real diagnostic result
      channelRef = supabase
        .channel(`diagnosticos-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "diagnostics_v3",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            goToResultado(1000);
          }
        )
        .subscribe();

      // 2.1 — Streaming de progresso real. A edge dispara `progress` em cada etapa
      // (validation → ai_call_started → persisting). Usamos isso para avançar
      // STEPS de forma honesta em vez de só timer.
      const stageToStepIndex: Record<string, number> = {
        validation: 1,
        ai_call_started: 4, // "Detectando carrinhos abandonados…" (highlight)
        persisting: 7,      // "Finalizando diagnóstico prescritivo…" (special)
      };
      progressChannelRef = supabase
        .channel(`diagnostico-progress-${userId}`)
        .on("broadcast", { event: "progress" }, (msg) => {
          const stage = String((msg as { payload?: { stage?: string } }).payload?.stage ?? "");
          const idx = stageToStepIndex[stage];
          if (typeof idx === "number") {
            realProgressRef.current = true;
            setCurrentStep((prev) => Math.max(prev, idx));
            // Avança visual também: ai_call_started ~50%, persisting ~85%
            const target = stage === "validation" ? 25 : stage === "ai_call_started" ? 60 : 90;
            setProgress((p) => Math.max(p, target));
          }
        })
        .subscribe();

      // 2. Resolve funnel payload — sessionStorage cache, fallback to DB.
      let funnel: FunnelPayload | null = null;

      const rawFunnel = sessionStorage.getItem("ltv_funnel_data");
      if (rawFunnel) {
        try {
          funnel = JSON.parse(rawFunnel) as FunnelPayload;
        } catch {
          funnel = null;
        }
      }

      if (!funnel) {
        // Fallback: latest funnel_metrics row + benchmark da loja em stores
        const { data: fm } = await supabase
          .from("funnel_metrics")
          .select("store_id,visitantes,visualizacoes_produto,adicionou_carrinho,iniciou_checkout,compras,receita")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fm) {
          const visitantes = Number(fm.visitantes) || 0;
          const compras = Number(fm.compras) || 0;
          const ticket = compras > 0 ? Number(fm.receita) / compras : 250;
          let benchmarkMeta = 2.5;
          if (fm.store_id) {
            const { data: st } = await supabase
              .from("stores")
              .select("meta_conversao")
              .eq("id", fm.store_id)
              .maybeSingle();
            const mc = Number((st as { meta_conversao?: number } | null)?.meta_conversao);
            if (Number.isFinite(mc) && mc > 0) benchmarkMeta = mc;
          }
          funnel = {
            visitantes,
            produto_visto: Number(fm.visualizacoes_produto) || Math.round(visitantes * 0.72),
            carrinho: Number(fm.adicionou_carrinho) || 0,
            checkout: Number(fm.iniciou_checkout) || 0,
            pedido: compras,
            ticket_medio: Math.round(ticket) || 250,
            meta_conversao: benchmarkMeta,
            store_id: fm.store_id,
          };
        }
      }

      // 3. Call gerar-diagnostico
      if (!diagnosticCalled) {
        setDiagnosticCalled(true);
        if (funnel) {
          try {
            const benchRef = benchmarkForDiagnostics(funnel);
            const invokeStartedAt = Date.now();

            // B1. Idempotência client-side: se já existe diagnóstico recente (< 5min) para esta loja, pula
            if (funnel.store_id) {
              const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
              const { data: recent } = await supabase
                .from("diagnostics_v3")
                .select("id")
                .eq("user_id", userId)
                .eq("store_id", funnel.store_id)
                .gte("created_at", fiveMinAgo)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (recent) {
                console.info("[analisando] Diagnóstico recente encontrado, indo direto pro /resultado");
                goToResultado(500);
                return;
              }
            }

            // === Enriquecimento opcional do payload ===
            // Cada bloco roda em allSettled — qualquer falha individual não bloqueia o diagnóstico.
            const storeId = funnel.store_id ?? null;
            let enriched: Record<string, unknown> = {};
            if (storeId) {
              const nowIso = new Date().toISOString();
              const in30dIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
              const todayIso = new Date().toISOString().slice(0, 10);
              const results = await Promise.allSettled([
                supabase.from("channels").select("tipo").eq("store_id", storeId).eq("ativo", true),
                supabase.from("catalog_snapshot").select("id", { count: "exact", head: true }).eq("store_id", storeId).lt("stock_qty", 5),
                supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", userId).lt("rating", 3),
                supabase.from("executions").select("prescricao_id,conversao_antes,conversao_depois,receita_gerada,iniciada_em").eq("store_id", storeId).order("iniciada_em", { ascending: false }).limit(10),
                supabase.from("commercial_calendar_br").select("event_name,event_date,category").gte("event_date", todayIso).lte("event_date", in30dIso).order("event_date", { ascending: true }).limit(3),
                supabase.from("data_quality_snapshots").select("utm_fill_rate,phone_fill_rate,ga4_purchase_vs_orders_diff_pct,snapshot_date,created_at").eq("store_id", storeId).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
              ]);

              const [chRes, stockRes, lowRevRes, execRes, calRes, dqRes] = results;
              if (chRes.status === "fulfilled" && Array.isArray(chRes.value.data)) {
                enriched.canais_conectados = (chRes.value.data as Array<{ tipo?: string }>).map((r) => r.tipo).filter(Boolean);
              }
              if (stockRes.status === "fulfilled" && typeof stockRes.value.count === "number") {
                enriched.produtos_estoque_critico = stockRes.value.count;
              }
              if (lowRevRes.status === "fulfilled" && typeof lowRevRes.value.count === "number") {
                enriched.produtos_avaliacao_baixa = lowRevRes.value.count;
              }
              if (execRes.status === "fulfilled" && Array.isArray(execRes.value.data)) {
                enriched.historico_prescricoes = (execRes.value.data as unknown as Array<Record<string, unknown>>).map((e) => {
                  const antes = Number(e.conversao_antes) || 0;
                  const depois = Number(e.conversao_depois) || 0;
                  const lift_pp = depois - antes;
                  return {
                    prescricao_id: e.prescricao_id,
                    conversao_antes: antes,
                    conversao_depois: depois,
                    lift_pp,
                    funcionou: lift_pp > 0,
                    receita_gerada: Number(e.receita_gerada) || 0,
                    roi_real: Number(e.receita_gerada) > 0 ? Number((Number(e.receita_gerada) / 100).toFixed(2)) : 0,
                  };
                });
              }
              if (calRes.status === "fulfilled" && Array.isArray(calRes.value.data)) {
                enriched.proximos_eventos_sazonais = (calRes.value.data as Array<{ event_name?: string; event_date?: string }>).map((e) => {
                  const dias = e.event_date ? Math.max(0, Math.round((new Date(e.event_date).getTime() - Date.now()) / 86_400_000)) : null;
                  return { nome: e.event_name, dias_restantes: dias };
                });
              }
              if (dqRes.status === "fulfilled" && dqRes.value.data) {
                const dq = dqRes.value.data as Record<string, unknown>;
                enriched.data_quality = {
                  utm_fill_rate: dq.utm_fill_rate ?? null,
                  phone_fill_rate: dq.phone_fill_rate ?? null,
                  ga4_diff_pct: dq.ga4_purchase_vs_orders_diff_pct ?? null,
                  last_sync_at: dq.created_at ?? nowIso,
                };
              }
            }

            const { data, error } = await supabase.functions.invoke("gerar-diagnostico", {
              body: {
                loja_id: funnel.store_id,
                visitantes: funnel.visitantes,
                produto_visto: funnel.produto_visto,
                carrinho: funnel.carrinho,
                checkout: funnel.checkout,
                pedido: funnel.pedido,
                ticket_medio: funnel.ticket_medio,
                meta_conversao: benchRef,
                ...(funnel.segmento ? { segmento: funnel.segmento } : {}),
                ...(funnel.field_provenance ? { field_provenance: funnel.field_provenance } : {}),
                ...(typeof funnel.real_signals_pct === "number" ? { real_signals_pct_client: funnel.real_signals_pct } : {}),
                ...enriched,
              },
            });

            // B3. Telemetria de qualidade do diagnóstico
            const totalMs = Date.now() - invokeStartedAt;
            const enrichedKeys = Object.keys(enriched);
            const payloadFields = [
              funnel.visitantes, funnel.produto_visto, funnel.carrinho,
              funnel.checkout, funnel.pedido, funnel.ticket_medio,
            ];
            const completeness = Math.round(
              (payloadFields.filter((v) => Number(v) > 0).length / payloadFields.length) * 100,
            );
            const respMeta = (data as { diagnostico?: { meta?: Record<string, unknown> } } | null)?.diagnostico?.meta;
            void trackFunnelEvent({
              event: "diagnostic_viewed",
              metadata: {
                phase: "diagnostic_generated",
                payload_completeness_pct: completeness,
                fallback_mode: Boolean(respMeta?.fallback_mode),
                parse_retry: Boolean(respMeta?.parse_retry),
                cached: Boolean(respMeta?.cached),
                total_ms: totalMs,
                enriched_fields: enrichedKeys,
                error_message: error?.message ?? null,
              },
            });

            if (!error && data?.success && data?.diagnostico) {
              if ((data as { persisted?: boolean }).persisted) {
                goToResultado(800);
                return;
              }

              const storeId = funnel.store_id;
              const conversao = funnel.pedido > 0 && funnel.visitantes > 0
                ? ((funnel.pedido / funnel.visitantes) * 100)
                : 0;
              const chs = Math.min(100, Math.max(0, Math.round(conversao / (benchRef || 2.5) * 50)));
              const chsLabel = chs >= 70 ? "Bom" : chs >= 40 ? "Regular" : "Em risco";

              const { error: insertErr } = await supabase.from("diagnostics_v3").insert({
                user_id: userId,
                store_id: storeId || null,
                diagnostic_json: data.diagnostico,
                chs,
                chs_label: chsLabel,
                recommended_plan: (data as { recommended_plan?: "growth" | "scale" }).recommended_plan,
              });
              if (insertErr) {
                console.error("diagnostics_v3 insert failed:", insertErr.message);
                goToResultado(500);
                return;
              }
              goToResultado(800);
            } else {
              // B4. Mensagem de erro orientada a ação
              console.warn("Diagnostic generation failed:", error?.message || "unknown");
              const dq = (enriched as { data_quality?: { ga4_diff_pct?: number | null } }).data_quality;
              const ga4Diff = dq?.ga4_diff_pct ?? null;
              const noChannels = !(enriched as { canais_conectados?: string[] }).canais_conectados?.length;
              if (typeof ga4Diff === "number" && Math.abs(ga4Diff) > 30) {
                toast.error("GA4 reporta valores muito divergentes da sua loja. Reconecte em /integrações.", {
                  duration: 8000,
                });
              } else if (noChannels) {
                toast.error("Nenhum canal conectado — diagnóstico ficará limitado. Conecte sua loja em /integrações.", {
                  duration: 8000,
                });
              } else {
                toast.error("Diagnóstico demorou mais que o esperado. Tentaremos novamente em 2 minutos.", {
                  duration: 6000,
                });
              }
              setTimeout(() => goToResultado(0), 3000);
            }
          } catch (e) {
            console.error("Erro ao chamar gerar-diagnostico:", e);
            setTimeout(() => goToResultado(0), 3000);
          }
        } else {
          navigate("/onboarding", { replace: true });
        }
      }
    }

    setupRealtimeAndDiagnose();

    // Visual progress (fake progress up to 95%)
    let elapsedMs = 0;
    const totalEstimatedMs = 20000;

    const visualInterval = setInterval(() => {
      elapsedMs += 100;
      // Quando há eventos reais, avançamos só a barra (suave) — o step
      // vem do canal de progresso. Sem eventos, continua o timer simulado.
      const newProgress = Math.min(95, (elapsedMs / totalEstimatedMs) * 100);
      setProgress((prev) => Math.max(prev, newProgress));
      if (!realProgressRef.current) {
        const stepIndex = Math.floor(elapsedMs / (totalEstimatedMs / STEPS.length));
        if (stepIndex < STEPS.length) setCurrentStep(stepIndex);
      }
    }, 100);

    // B2. Polling com backoff (substitui timer fixo de 25s)
    let pollCancelled = false;
    const pollDelays = [3000, 6000, 12000];
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;
      for (const delay of pollDelays) {
        if (pollCancelled || navigatedToResultadoRef.current) return;
        await new Promise((r) => setTimeout(r, delay));
        if (pollCancelled || navigatedToResultadoRef.current) return;
        const { data: row } = await supabase
          .from("diagnostics_v3")
          .select("id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (row) {
          goToResultado(500);
          return;
        }
      }
      // Esgotou todas as tentativas — fallback final
      if (!navigatedToResultadoRef.current) goToResultado(0);
    })();

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
      if (progressChannelRef) supabase.removeChannel(progressChannelRef);
      clearInterval(visualInterval);
      pollCancelled = true;
    };
  }, [navigate, diagnosticCalled]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-12">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
          <div className="relative w-24 h-24 bg-[#13131A] border border-[#1E1E2E] rounded-full flex items-center justify-center mx-auto shadow-2xl">
            <Sparkles className="w-10 h-10 text-primary animate-bounce" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-black font-syne tracking-tighter">Analisando sua loja...</h1>
          <p className="text-muted-foreground text-sm">Gerando seu diagnóstico personalizado em tempo real.</p>
        </div>

        <div className="space-y-3 text-left">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 text-sm transition-all duration-500",
                i < currentStep ? "text-primary opacity-100" :
                i === currentStep ? "text-white scale-105 font-bold" : "text-muted-foreground opacity-30"
              )}
            >
              {i < currentStep ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : i === currentStep ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-current shrink-0" />
              )}
              <span className={cn(s.special && i === currentStep && "text-purple-400")}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="h-1.5 w-full bg-[#13131A] rounded-full overflow-hidden border border-[#1E1E2E]">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <span>Processando dados</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="pt-8">
          <p className="text-[10px] text-muted-foreground italic font-medium">
            "A IA está cruzando dados de 94 lojas similares para encontrar seus maiores gargalos."
          </p>
        </div>

        <SocialProofCarousel />
      </div>
    </div>
  );
}

const TESTIMONIALS = [
  { name: "Lucas — ModaFit", text: "Recuperamos R$ 38k na 1ª semana só com a fila de carrinhos." },
  { name: "Marina — Bella Beauty", text: "Payback em 9 dias. A IA achou 3 vazamentos que não víamos." },
  { name: "Rafael — SuppleMax", text: "+31% em reativação no 1º mês. Mudou nossa operação." },
];

function SocialProofCarousel() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIALS.length), 4000);
    return () => clearInterval(t);
  }, []);
  const t = TESTIMONIALS[idx];
  return (
    <div className="pt-4 border-t border-[#1E1E2E]">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
        Lojas que já passaram por aqui
      </p>
      <div key={idx} className="animate-in fade-in duration-500">
        <p className="text-sm text-foreground/90 italic leading-relaxed">"{t.text}"</p>
        <p className="text-[11px] font-bold text-primary mt-2">— {t.name}</p>
      </div>
    </div>
  );
}
