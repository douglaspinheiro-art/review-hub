import { Button } from "@/components/ui/button";
import { ArrowRight, Star, Sparkles, ShoppingCart, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function Hero() {
  return (
    <section className="pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden relative">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Coluna esquerda — copy */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-semibold px-4 py-2 rounded-full border border-primary/20">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3 h-3 fill-primary" />
                ))}
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
                <span
                  key={proof}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary border border-border/50"
                >
                  {proof}
                </span>
              ))}
            </div>

            <div className="space-y-2">
              <Button
                asChild
                size="lg"
                className="h-14 px-8 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all"
              >
                <a href="/signup">
                  Ver quanto estou perdendo (grátis) <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
              <p className="text-[11px] text-muted-foreground">
                • Leva menos de 1 minuto • Sem cartão • Resultado imediato
              </p>
            </div>
          </div>

          {/* Coluna direita — mock do diagnóstico */}
          <div className="relative">
            <div className="absolute -inset-8 bg-primary/10 blur-[80px] rounded-full opacity-40" />

            {/* Badge flutuante: nova venda */}
            <div className="absolute -top-4 -right-2 z-20 bg-card border border-primary/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-700">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-foreground leading-tight">Nova venda</p>
                <p className="text-xs font-bold text-primary leading-tight">+ R$ 489</p>
              </div>
            </div>

            <div className="relative bg-card border border-border/50 rounded-2xl p-6 md:p-8 shadow-2xl">
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-6">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Diagnóstico da loja
              </div>

              {/* Score + perda */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Score
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-display font-extrabold text-primary leading-none">68</span>
                    <span className="text-lg font-bold text-muted-foreground">/100</span>
                  </div>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                    Regular
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Você está perdendo
                  </p>
                  <p className="text-3xl md:text-4xl font-display font-extrabold text-destructive leading-none">
                    R$ 7.856
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">/mês</p>
                </div>
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-secondary/40 border border-border/40 rounded-lg p-3 text-center">
                  <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-1">
                    Sua CVR
                  </p>
                  <p className="text-lg font-display font-extrabold">1,40%</p>
                </div>
                <div className="bg-secondary/40 border border-border/40 rounded-lg p-3 text-center">
                  <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-1">
                    Benchmark
                  </p>
                  <p className="text-lg font-display font-extrabold text-primary">2,50%</p>
                </div>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-destructive" />
                    <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-destructive">
                      Gargalo: Checkout
                    </p>
                  </div>
                  <p className="text-xs font-bold text-destructive">– R$ 5.8K/mês</p>
                </div>
              </div>

              {/* Análise da IA */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
                    Análise da IA
                  </span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  Seu checkout converte 44% abaixo do benchmark. Recupere até{" "}
                  <span className="font-bold text-primary">R$ 5.800/mês</span> com 3 ações
                </p>
              </div>

              {/* Badge flutuante: carrinho recuperado */}
              <div className="absolute -bottom-4 -left-2 bg-card border border-primary/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-foreground leading-tight">Carrinho recuperado</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Automação WhatsApp</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
