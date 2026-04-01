import { useInView } from "@/hooks/useInView";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";

const benefits = [
  "WhatsApp Business API oficial",
  "Campanhas ilimitadas",
  "Chatbot com IA avançada",
  "Analytics e matriz RFM",
  "Múltiplos atendentes",
  "Integrações com e-commerce",
  "Suporte dedicado",
  "Onboarding personalizado",
];

export default function Pricing() {
  const { ref, inView } = useInView();

  return (
    <section id="planos" ref={ref} className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Plano sob <span className="text-primary">consulta</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Montamos um plano personalizado de acordo com as necessidades do seu negócio.
          </p>
        </div>

        <div className={`max-w-lg mx-auto bg-card border-2 border-primary/20 rounded-3xl p-8 md:p-10 shadow-lg transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="text-center mb-8">
            <p className="text-sm font-semibold text-primary mb-2">PLANO COMPLETO</p>
            <p className="text-4xl font-extrabold">Sob Consulta</p>
            <p className="text-muted-foreground text-sm mt-1">Preço personalizado para sua operação</p>
          </div>

          <ul className="space-y-3 mb-8">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                {b}
              </li>
            ))}
          </ul>

          <Button size="lg" className="w-full gap-2">
            Falar com Consultor <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
