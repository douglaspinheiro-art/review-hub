import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    function goToResultado(delayMs = 800) {
      if (navigatedToResultadoRef.current) return;
      navigatedToResultadoRef.current = true;
      setProgress(100);
      setTimeout(() => navigate("/resultado", { replace: true }), delayMs);
    }

    async function setupRealtimeAndDiagnose() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

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
            const { data, error } = await supabase.functions.invoke("gerar-diagnostico", {
              body: {
                visitantes: funnel.visitantes,
                produto_visto: funnel.produto_visto,
                carrinho: funnel.carrinho,
                checkout: funnel.checkout,
                pedido: funnel.pedido,
                ticket_medio: funnel.ticket_medio,
                meta_conversao: benchRef,
                ...(funnel.segmento ? { segmento: funnel.segmento } : {}),
              },
            });

            if (!error && data?.success && data?.diagnostico) {
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
              });
              if (insertErr) {
                console.error("diagnostics_v3 insert failed:", insertErr.message);
                goToResultado(500);
                return;
              }
              goToResultado(800);
            } else {
              console.warn("Diagnostic generation failed:", error?.message || "unknown");
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
      const newProgress = Math.min(95, (elapsedMs / totalEstimatedMs) * 100);
      setProgress(newProgress);

      const stepIndex = Math.floor((elapsedMs / (totalEstimatedMs / STEPS.length)));
      if (stepIndex < STEPS.length) setCurrentStep(stepIndex);
    }, 100);

    // Fallback: navigate after 25s even without realtime event
    const fallbackTimer = setTimeout(() => {
      goToResultado(0);
    }, 25000);

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
      clearInterval(visualInterval);
      clearTimeout(fallbackTimer);
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
      </div>
    </div>
  );
}
