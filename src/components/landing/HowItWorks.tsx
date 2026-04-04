import { useInView } from "@/hooks/useInView";
import { Link2, BarChart3, Zap, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: Link2,
    step: "01",
    title: "Conecte",
    desc: "Integre seu e-commerce e WhatsApp em menos de 5 minutos. Sem código, sem complicação.",
  },
  {
    icon: BarChart3,
    step: "02",
    title: "Analise",
    desc: "Nossa IA mapeia seu funil, identifica gargalos e segmenta sua base automaticamente com RFM.",
  },
  {
    icon: Zap,
    step: "03",
    title: "Automatize",
    desc: "Campanhas de carrinho abandonado, pós-venda, reativação e cross-sell rodam sozinhas.",
  },
  {
    icon: Rocket,
    step: "04",
    title: "Escale",
    desc: "Acompanhe ROI em tempo real, otimize com testes A/B e escale o que funciona.",
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
            De zero a resultados em <span className="text-gradient">4 passos</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Setup completo em menos de 1 hora. Resultados já na primeira semana.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30" />

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
      </div>
    </section>
  );
}
