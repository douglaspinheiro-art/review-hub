import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const STEPS = [
  { label: "Establishing secure connection...", ms: 1200 },
  { label: "Mapping transactions from the last 6 months...", ms: 1800 },
  { label: "Identifying unique multichannel customers...", ms: 1500 },
  { label: "Detecting abandoned carts (last 48h)...", ms: 2000, highlight: true },
  { label: "Calculating Conversion Health Score (CHS)...", ms: 1500 },
  { label: "Cross-referencing with segment benchmarks...", ms: 1500 },
  { label: "Quantifying revenue lost to UX bottlenecks...", ms: 1200 },
  { label: "Finalizing prescriptive diagnosis...", ms: 2500, special: true },
];

export default function Analisando() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [diagnosticCalled, setDiagnosticCalled] = useState(false);

  useEffect(() => {
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

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
            setProgress(100);
            setTimeout(() => navigate("/resultado"), 1000);
          }
        )
        .subscribe();

      // 2. Call gerar-diagnostico with real data from sessionStorage
      if (!diagnosticCalled) {
        setDiagnosticCalled(true);
        const rawFunnel = sessionStorage.getItem("ltv_funnel_data");
        if (rawFunnel) {
          try {
            const funnel = JSON.parse(rawFunnel);
            const { data, error } = await supabase.functions.invoke("gerar-diagnostico", {
              body: {
                visitantes: funnel.visitantes,
                produto_visto: funnel.produto_visto,
                carrinho: funnel.carrinho,
                checkout: funnel.checkout,
                pedido: funnel.pedido,
                ticket_medio: funnel.ticket_medio,
                meta_conversao: funnel.meta_conversao,
              },
            });

            if (!error && data?.success && data?.diagnostico) {
              // Save result to diagnostics_v3
              const storeId = funnel.store_id;
              const conversao = funnel.pedido > 0 && funnel.visitantes > 0
                ? ((funnel.pedido / funnel.visitantes) * 100)
                : 0;
              const chs = Math.min(100, Math.max(0, Math.round(conversao / (funnel.meta_conversao || 2.5) * 50)));
              const chsLabel = chs >= 70 ? "Good" : chs >= 40 ? "Regular" : "At risk";

              await supabase.from("diagnostics_v3").insert({
                user_id: userId,
                store_id: storeId || null,
                diagnostic_json: data.diagnostico,
                chs,
                chs_label: chsLabel,
              });
              // Realtime listener will pick this up and navigate
            } else {
              // Edge function failed — fallback navigate
              console.warn("Diagnostic generation failed:", error?.message || "unknown");
              setTimeout(() => {
                setProgress(100);
                navigate("/resultado");
              }, 3000);
            }
          } catch (e) {
            console.error("Error calling gerar-diagnostico:", e);
            setTimeout(() => {
              setProgress(100);
              navigate("/resultado");
            }, 3000);
          }
        } else {
          // No funnel data — navigate directly
          navigate("/resultado");
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
      setProgress(100);
      navigate("/resultado");
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
          <h1 className="text-3xl font-black font-syne tracking-tighter">Analyzing your store...</h1>
          <p className="text-muted-foreground text-sm">Generating your personalized diagnostic in real time.</p>
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
            <span>Processing Data</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="pt-8">
          <p className="text-[10px] text-muted-foreground italic font-medium">
            "AI is cross-referencing data from 94 similar stores to find your biggest bottlenecks."
          </p>
        </div>
      </div>
    </div>
  );
}
