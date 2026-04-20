import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp, ShoppingBag, FileText } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

const examples = [
  { icon: Sparkles, title: "Recuperação VIP", msg: "Olá, Ana! Notamos que você adicionou itens ao carrinho mas não finalizou. Posso te ajudar a concluir? Tenho uma condição especial reservada." },
  { icon: TrendingUp, title: "Upsell Inteligente", msg: "Carlos, com base nas suas últimas compras, preparamos uma seleção que combina perfeitamente com o que você já tem. Quer ver?" },
  { icon: ShoppingBag, title: "Reativação Preditiva", msg: "Oi, Juliana! Faz 45 dias desde sua última compra - separamos novidades do segmento que você mais curte. Posso mostrar?" },
  { icon: FileText, title: "NPS Consultivo", msg: "Pedro, sua última experiência conosco foi há 3 dias. O que achou? Sua resposta vai direto para o time de produto." },
];

export default function CTASection() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-36 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] opacity-50" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Revenue-at-risk banner */}
        <div className={cn(
          "max-w-4xl mx-auto mb-16 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        )}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-destructive/10 border border-destructive/30 rounded-2xl px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-[10px] font-black tracking-[0.25em] uppercase text-destructive mb-0.5">Receita em risco agora</p>
                <p className="text-base sm:text-lg font-bold">
                  <span className="font-display text-destructive">R$ 70.715</span> identificados e ainda não capturados
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="h-12 px-6 rounded-xl font-bold shrink-0">
              <a href="/signup">Recuperar agora <ArrowRight className="ml-2 w-4 h-4" /></a>
            </Button>
          </div>
        </div>

        <div className={cn(
          "text-center max-w-3xl mx-auto mb-20 transition-all duration-1000",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black tracking-[0.3em] px-5 py-2 rounded-full mb-8 uppercase">
            Resultados em até 48h de operação
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black font-syne tracking-tighter mb-8 leading-[1.1]">
            Recupere carrinho, ative recompra <br />
            <span className="text-primary italic">e reduza churn no automático.</span>
          </h2>
          <p className="text-muted-foreground text-xl mb-10 leading-relaxed max-w-2xl mx-auto">
            Cada mensagem é gerada pelo Agente IA com base no comportamento real do cliente - nome, histórico, momento certo. Zero template genérico.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-16 px-10 text-lg font-black bg-emerald-600 hover:bg-emerald-500 rounded-2xl shadow-xl shadow-emerald-900/20 gap-2">
              <a href="/signup">
                Começar agora <ArrowRight className="w-5 h-5" />
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild className="h-16 px-10 text-lg font-bold border-white/10 bg-white/5 backdrop-blur-md rounded-2xl hover:bg-white/10">
              <a href="/contato?assunto=demo">Ver demo personalizada</a>
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {examples.map(({ icon: Icon, title, msg }, idx) => (
            <div
              key={title}
              className={cn(
                "group bg-card/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 transition-all duration-700 hover:border-primary/30",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-black tracking-tighter uppercase">{title}</span>
              </div>
              <div className="bg-background/40 border border-white/5 rounded-2xl p-4 text-[13px] leading-relaxed text-muted-foreground italic relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/30" />
                "{msg}"
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
