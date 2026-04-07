import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, X, ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface NPSModalProps {
  onClose: () => void;
}

export function NPSModal({ onClose }: NPSModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [step, setStep] = useState<"score" | "followup" | "done">("score");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const isPromoter = selected !== null && selected >= 9;
  const isDetractor = selected !== null && selected <= 6;

  async function handleSubmit() {
    if (selected === null) return;
    setSubmitting(true);

    // Save NPS response (best-effort, no error blocking UI)
    await supabase.from("nps_responses").insert({
      user_id: user?.id,
      score: selected,
      comment: comment || null,
      responded_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    // Detractor: flag for CS follow-up
    if (isDetractor) {
      await supabase.from("cs_alerts").insert({
        user_id: user?.id,
        type: "nps_detractor",
        score: selected,
        note: comment || null,
      }).then(() => {}).catch(() => {});
    }

    setSubmitting(false);
    setStep("done");

    if (isPromoter) {
      setTimeout(() => {
        onClose();
        navigate("/dashboard/afiliados");
      }, 2000);
    } else {
      setTimeout(onClose, 3000);
    }
  }

  function handleScoreSelect(score: number) {
    setSelected(score);
    setTimeout(() => setStep("followup"), 300);
  }

  const scoreColor = (score: number) => {
    if (score <= 6) return "bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20";
    if (score <= 8) return "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20";
    return "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 h-8 w-8 text-muted-foreground"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>

        {step === "score" && (
          <>
            <div className="space-y-2 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Heart className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-black font-syne tracking-tighter">Você indicaria o LTV Boost?</h3>
              <p className="text-sm text-muted-foreground">De 0 a 10, qual a probabilidade de recomendar a um amigo lojista?</p>
            </div>
            <div className="grid grid-cols-11 gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => handleScoreSelect(i)}
                  className={cn(
                    "h-10 rounded-xl border text-sm font-black transition-all hover:scale-110",
                    selected === i ? "ring-2 ring-primary scale-110 " + scoreColor(i) : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-1">
              <span>Nem um pouco</span>
              <span>Com certeza!</span>
            </div>
          </>
        )}

        {step === "followup" && (
          <>
            <div className="space-y-2">
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                isPromoter ? "bg-emerald-500/10 text-emerald-400" : isDetractor ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
              )}>
                Nota {selected}
              </div>
              <h3 className="text-xl font-black font-syne tracking-tighter">
                {isPromoter ? "Que ótimo! O que mais te ajudou?" : isDetractor ? "O que poderíamos melhorar?" : "O que faria você dar 10?"}
              </h3>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={isPromoter ? "Conta pra gente o que funcionou..." : "Seu feedback é valioso para nós..."}
              className="w-full h-24 bg-muted/30 border border-border/50 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {isPromoter && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                <p className="text-sm font-bold text-emerald-400">🎁 Ganhe 30% de comissão recorrente</p>
                <p className="text-xs text-muted-foreground mt-1">Como promotor, vamos te convidar para o programa de afiliados com link pré-gerado.</p>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                className="flex-1 font-black"
                onClick={handleSubmit}
                disabled={submitting}
              >
                Enviar {isPromoter && <ArrowRight className="w-4 h-4 ml-1" />}
              </Button>
              <Button variant="ghost" onClick={handleSubmit} disabled={submitting}>Pular</Button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto animate-in zoom-in-50 duration-500">
              {isPromoter ? (
                <Heart className="w-8 h-8 text-primary fill-primary animate-pulse" />
              ) : (
                <MessageCircle className="w-8 h-8 text-primary" />
              )}
            </div>
            <h3 className="text-xl font-black font-syne tracking-tighter">
              {isPromoter ? "Obrigado! Preparando seu link de afiliado..." : "Feedback recebido!"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isPromoter
                ? "Você vai ganhar 30% de comissão recorrente por cada indicação."
                : "Nosso time vai analisar seu feedback em breve."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
