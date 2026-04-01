import { useInView } from "@/hooks/useInView";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Carolina Mendes",
    role: "CEO, ModaFit",
    text: "A ConversaHub transformou completamente nossa estratégia de relacionamento. O ROI foi impressionante desde o primeiro mês.",
  },
  {
    name: "Ricardo Oliveira",
    role: "Head de Marketing, TechStore",
    text: "Automatizamos 80% do nosso atendimento e as vendas pelo WhatsApp cresceram 250%. Ferramenta indispensável.",
  },
  {
    name: "Juliana Santos",
    role: "Diretora, BelezaPura",
    text: "Os insights da plataforma nos ajudaram a entender nossos clientes de verdade. A fidelização nunca foi tão alta.",
  },
];

export default function Testimonials() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            O que nossos clientes <span className="text-primary">dizem</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((t, idx) => (
            <div
              key={t.name}
              className={`bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <Quote className="w-8 h-8 text-primary/20 mb-4" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">{t.text}</p>
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-4 h-4 text-primary fill-primary" />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {t.name[0]}
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
