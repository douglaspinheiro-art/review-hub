import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

const STEPS = [
  { label: "Estabelecendo conexão segura com os canais...", ms: 1200 },
  { label: "Mapeando transações dos últimos 6 meses...", ms: 1800 },
  { label: "Identificando clientes únicos multicanal...", ms: 1500 },
  { label: "Detectando carrinhos abandonados (últimas 48h)...", ms: 2000, highlight: true },
  { label: "Calculando Conversion Health Score (CHS)...", ms: 1500 },
  { label: "Cruzando dados com benchmark do segmento...", ms: 1500 },
  { label: "Quantificando lucro perdido por gargalos de UX...", ms: 1200 },
  { label: "Finalizando diagnóstico prescritivo...", ms: 2500, special: true },
];

export default function Analisando() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const perda = searchParams.get("perda");
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    async function setupRealtime() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      // Filter by user_id so only the authenticated user's own diagnostics trigger navigation.
      channelRef = supabase
        .channel(`diagnosticos-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "diagnosticos_v3",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            setProgress(100);
            setTimeout(() => navigate(`/resultado${perda ? `?perda=${perda}` : ""}`), 1000);
          }
        )
        .subscribe();
    }

    setupRealtime();

    // 2. Lógica visual de progresso (fake progress até 95%)
    let elapsedMs = 0;
    const totalEstimatedMs = 15000; // 15s de estimativa visual

    const visualInterval = setInterval(() => {
      elapsedMs += 100;
      const newProgress = Math.min(95, (elapsedMs / totalEstimatedMs) * 100);
      setProgress(newProgress);

      // Atualiza o passo atual baseado no tempo
      const stepIndex = Math.floor((elapsedMs / (totalEstimatedMs / STEPS.length)));
      if (stepIndex < STEPS.length) setCurrentStep(stepIndex);
    }, 100);

    // 3. Fallback: navegar para resultado após 16s mesmo sem evento realtime
    const fallbackTimer = setTimeout(() => {
      setProgress(100);
      navigate(`/resultado${perda ? `?perda=${perda}` : ""}`);
    }, 16000);

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
      clearInterval(visualInterval);
      clearTimeout(fallbackTimer);
    };
  }, [navigate, perda]);

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
          <h1 className="text-3xl font-black font-syne tracking-tighter">Analisando seus canais...</h1>
          <p className="text-muted-foreground text-sm">Preparando seu diagnóstico personalizado em tempo real.</p>
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
            <span>Processando Dados</span>
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
