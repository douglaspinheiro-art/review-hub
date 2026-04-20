import { Button } from "@/components/ui/button";
import { ArrowRight, Star, ShoppingCart, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";

export default function Hero() {
  return (
    <section className="pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden relative">
      {/* Background glow */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full border border-primary/20">
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(s => <Star key={s} className="w-3 h-3 fill-primary" />)}
              </div>
              Avaliado 4.9/5 por 200+ lojistas
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold leading-[1.05] tracking-tight">
              Descubra quanto sua loja perde{" "}
              <span className="text-gradient">todo dia.</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              A LTV Boost identifica o dinheiro parado na sua base e recupera automaticamente. Comece com um diagnóstico gratuito.
            </p>

            <div className="flex flex-wrap gap-2">
              {[
                "Moda: +22% recompra em 60 dias",
                "Beleza: payback médio em 9 dias",
                "Suplementos: +31% em reativação",
              ].map((proof) => (
                <span key={proof} className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary border border-border/50">
                  {proof}
                </span>
              ))}
            </div>

            <div className="space-y-3">
              <Button asChild size="lg" className="h-14 px-8 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] transition-all">
                <a href="/signup">
                  Ver quanto estou perdendo (grátis) <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
              <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>• Leva menos de 1 minuto</span>
                <span>• Sem cartão</span>
                <span>• Resultado imediato</span>
              </p>
            </div>
          </div>

          {/* Diagnóstico card (substitui mockup genérico) */}
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/10 blur-[80px] rounded-full opacity-40" />

            <div className="relative bg-card border border-border/50 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Diagnóstico da loja
              </div>

              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-display font-extrabold text-foreground leading-none">68</span>
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                  <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-500 uppercase tracking-wider">Regular</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Você está perdendo</p>
                  <p className="text-2xl font-display font-extrabold text-destructive leading-tight">R$ 7.856</p>
                  <p className="text-[11px] text-muted-foreground">/mês</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { label: "Sua CVR", value: "1,40%" },
                  { label: "Benchmark", value: "2,50%" },
                  { label: "Perda/dia", value: "R$ 262" },
                ].map(m => (
                  <div key={m.label} className="bg-secondary/50 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                    <p className="text-sm font-bold mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary">Análise da IA</span>
                </div>
                <p className="text-[12px] text-foreground/80 leading-relaxed">
                  Seu checkout converte 44% abaixo do benchmark. Recupere até <span className="text-primary font-semibold">R$ 5.800/mês</span> com 3 ações prioritárias.
                </p>
              </div>
            </div>

            <div className="absolute -top-4 -right-4 bg-card border border-border/50 rounded-xl px-4 py-3 shadow-xl animate-float">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Nova venda</p>
                  <p className="text-sm font-bold text-primary">+ R$ 489</p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-3 -left-4 bg-card border border-border/50 rounded-xl px-4 py-3 shadow-xl animate-float-delayed">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Carrinho recuperado</p>
                  <p className="text-[11px] text-muted-foreground">Automação WhatsApp</p>
                </div>
              </div>
            </div>

            <div className="absolute top-1/2 -right-6 bg-card border border-border/50 rounded-xl px-4 py-3 shadow-xl animate-float-slow">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-destructive/15 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Gargalo: Checkout</p>
                  <p className="text-[11px] text-muted-foreground">− R$ 5.8K/mês</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
