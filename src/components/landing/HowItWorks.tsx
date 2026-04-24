import { useInView } from "@/hooks/useInView";
import { BarChart3, Bot, MessageCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: BarChart3,
    step: "01",
    title: "Lê do GA4",
    desc: "Conectamos seu Google Analytics 4 em 2 cliques. Lemos sessões, eventos do funil e atribuição reais — não estimamos, não inventamos.",
  },
  {
    icon: Bot,
    step: "02",
    title: "IA decide",
    desc: "Claude Sonnet identifica o gargalo de maior impacto financeiro e decide quem abordar, quando e com qual oferta.",
  },
  {
    icon: MessageCircle,
    step: "03",
    title: "Executa no canal",
    desc: "Dispara WhatsApp (Meta Cloud API oficial) e Email com copy gerada por IA, segmentada por RFM e janela de propensão.",
  },
  {
    icon: RefreshCw,
    step: "04",
    title: "Volta para o GA4",
    desc: "Cada conversão é atribuída de volta no seu GA4 com UTMs próprias. O loop recalibra timing, copy e segmentação a cada ciclo.",
  },
];

export default function HowItWorks() {
  const { ref, inView } = useInView();

  return (
    <section id="como-funciona" ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-16 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Como funciona</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            O loop fechado em <span className="text-gradient">4 etapas</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            GA4 → IA → WhatsApp/Email → GA4. Sem dashboard paralelo. Sem dado inventado. O ciclo recalibra sozinho.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto relative">
          {/* Closed loop line: from step 1 through step 4 and back */}
          <div className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-primary/30 via-primary/70 to-primary/30" />
          <div className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-8 border-t-0 border-l border-r border-b border-dashed border-primary/30 rounded-b-3xl translate-y-[-2.25rem]" aria-hidden />

          {steps.map((s, idx) => (
            <div
              key={s.step}
              className={cn(
                "relative text-center space-y-4 transition-all duration-700",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <div className="w-20 h-20 rounded-2xl bg-secondary border border-border/50 flex items-center justify-center mx-auto relative group hover:border-primary/50 hover:bg-primary/5 transition-all">
                <s.icon className="w-8 h-8 text-primary" />
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {s.step}
                </div>
              </div>
              <h3 className="font-display font-bold text-lg">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10 max-w-2xl mx-auto">
          O loop volta para o passo 01: o GA4 recebe a conversão atribuída e a IA usa o resultado para refinar o próximo ciclo.
        </p>
      </div>
    </section>
  );
}
