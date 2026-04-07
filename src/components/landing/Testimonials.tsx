import { useInView } from "@/hooks/useInView";
import { Star, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

const testimonials = [
  {
    name: "Carolina Mendes",
    role: "CEO, ModaFit",
    initials: "CM",
    gradient: "from-violet-500 to-purple-600",
    text: "A LTV Boost transformou completamente nossa estratégia de relacionamento. Triplicamos a recompra em 6 meses.",
    metric: "+340% LTV",
  },
  {
    name: "Ricardo Oliveira",
    role: "Head de Marketing, TechStore",
    initials: "RO",
    gradient: "from-blue-500 to-cyan-500",
    text: "Automatizamos 80% do atendimento e as vendas pelo WhatsApp cresceram 250%. ROI se pagou em 2 semanas.",
    metric: "+250% vendas",
  },
  {
    name: "Juliana Santos",
    role: "Diretora, BelezaPura",
    initials: "JS",
    gradient: "from-rose-500 to-pink-500",
    text: "Os insights da plataforma nos ajudaram a entender nossos clientes de verdade. A fidelização nunca foi tão alta.",
    metric: "67% retenção",
  },
  {
    name: "André Lima",
    role: "CMO, NutriVida",
    initials: "AL",
    gradient: "from-amber-500 to-orange-500",
    text: "O chatbot com IA reduziu nosso tempo de resposta de 4h para 2min. Os clientes adoram a experiência.",
    metric: "< 2min resposta",
  },
];

export default function Testimonials() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Depoimentos</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            O que nossos clientes <span className="text-gradient">dizem</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {testimonials.map((t, idx) => (
            <div
              key={t.name}
              className={cn(
                "bg-card border border-border/50 rounded-2xl p-6 hover:border-primary/30 transition-all duration-500 flex flex-col",
                inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              <Quote className="w-8 h-8 text-primary/20 mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">{t.text}</p>
              
              <div className="bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full inline-block mb-4 w-fit">
                {t.metric}
              </div>

              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3.5 h-3.5 text-primary fill-primary" />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-[11px] font-bold text-primary-foreground`}>
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
