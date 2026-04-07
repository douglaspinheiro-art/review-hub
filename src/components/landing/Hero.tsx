import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import Calculator from "./Calculator";

export default function Hero() {
  const [calcPerda, setCalcPerda] = useState(0);

  return (
    <section className="pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-4 py-1.5 rounded-full border border-primary/20 animate-pulse-subtle uppercase tracking-[0.2em]">
                <Sparkles className="w-3.5 h-3.5 fill-primary" />
                Exclusivo para e-commerces acima de R$ 50k/mês
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black font-syne leading-[0.9] tracking-tighter">
                Recupere o lucro que sua loja <br />
                <span className="text-primary italic">está perdendo todo mês.</span>
              </h1>
            </div>

            <div className="space-y-6">
              <p className="text-xl text-muted-foreground max-w-lg font-medium leading-relaxed">
                Nossa IA detecta falhas invisíveis no seu funil, prescreve a solução exata e executa a recuperação via WhatsApp automaticamente.
              </p>
              <div className="flex items-center gap-3 text-emerald-500 font-bold">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Aumente seu LTV em até 34% sem gastar mais em anúncios.</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center">
              <Button
                asChild
                size="lg"
                className="h-14 px-8 text-base font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all"
              >
                <a href={calcPerda > 0 ? `/signup?perda=${calcPerda}` : "/signup"}>
                  {calcPerda > 0
                    ? `Recuperar R$ ${calcPerda.toLocaleString("pt-BR")} →`
                    : "Fazer diagnóstico grátis →"}
                </a>
              </Button>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full border-4 border-background bg-muted" />
                  ))}
                  <div className="w-10 h-10 rounded-full border-4 border-background bg-primary flex items-center justify-center text-[10px] font-bold text-white">
                    +200
                  </div>
                </div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Lojistas Lucrando</p>
              </div>
            </div>

            {calcPerda > 0 && (
              <p className="text-xs text-muted-foreground/60 font-medium -mt-2">
                ↑ Valor calculado em tempo real com base nos seus dados acima
              </p>
            )}

            {/* Platform trust badges */}
            <div className="pt-2 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">Integra nativamente com</p>
              <div className="flex flex-wrap gap-2">
                {["Shopify", "Nuvemshop", "WooCommerce", "VTEX", "Yampi", "Tray", "Loja Integrada"].map((p) => (
                  <span key={p} className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-black text-muted-foreground/70">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative" id="calculator">
            <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-30 animate-pulse" />
            <Calculator onPerdaChange={setCalcPerda} />
          </div>
        </div>
      </div>
    </section>
  );
}
