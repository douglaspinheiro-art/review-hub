import { useState } from "react";
import { useInView } from "@/hooks/useInView";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Professional",
    priceMonthly: 297,
    priceYearly: 237,
    description: "Para e-commerces em crescimento",
    highlight: false,
    cta: "Iniciar trial de 14 dias",
    features: [
      "10.000 mensagens/mês",
      "5.000 contatos",
      "3 conexões WhatsApp",
      "Campanhas automatizadas",
      "Carrinho abandonado",
      "RFM + segmentação",
      "Analytics básico",
      "Suporte via WhatsApp",
    ],
  },
  {
    name: "Business",
    priceMonthly: 697,
    priceYearly: 557,
    description: "Para operações de alto volume",
    highlight: true,
    badge: "Mais popular",
    cta: "Iniciar trial de 14 dias",
    features: [
      "50.000 mensagens/mês",
      "25.000 contatos",
      "Conexões ilimitadas",
      "Chatbot com IA avançada",
      "Testes A/B automáticos",
      "Analytics avançado (cohorts, LTV)",
      "Multi-canal (WhatsApp + SMS + e-mail)",
      "Flow builder visual",
      "API pública completa",
      "Gerente de sucesso dedicado",
    ],
  },
  {
    name: "Enterprise",
    priceMonthly: 0,
    priceYearly: 0,
    description: "Para grandes redes e franquias",
    highlight: false,
    cta: "Falar com consultor",
    ctaHref: "/contato",
    features: [
      "Tudo do Business",
      "Volume personalizado",
      "SLA dedicado e suporte 24/7",
      "Infraestrutura dedicada",
      "Integração com ERPs (Bling, SAP)",
      "White-label para agências",
      "Benchmark setorial exclusivo",
      "Treinamento da equipe",
    ],
  },
];

export default function Pricing() {
  const { ref, inView } = useInView();
  const [annual, setAnnual] = useState(true);

  return (
    <section id="planos" ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Planos</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Invista em <span className="text-gradient">resultados</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-6">
            ROI médio de 12x. Trial de 14 dias grátis, sem cartão de crédito.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 bg-secondary rounded-xl p-1">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                !annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
                annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Anual <span className="text-primary text-xs font-bold">-20%</span>
            </button>
          </div>
        </div>

        <div className={cn(
          "grid md:grid-cols-3 gap-6 max-w-5xl mx-auto transition-all duration-700 delay-150",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          {PLANS.map((plan) => {
            const price = plan.priceMonthly === 0 ? null : annual ? plan.priceYearly : plan.priceMonthly;
            return (
              <div
                key={plan.name}
                className={cn(
                  "relative bg-card border rounded-2xl p-7 flex flex-col",
                  plan.highlight
                    ? "border-primary ring-2 ring-primary/30 shadow-xl shadow-primary/10"
                    : "border-border/50"
                )}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap shadow-lg shadow-primary/30">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-display font-bold text-lg">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm mt-0.5">{plan.description}</p>
                  <p className="mt-4 text-4xl font-display font-extrabold">
                    {price ? (
                      <>
                        R$ {price}
                        <span className="text-sm font-normal text-muted-foreground">/mês</span>
                      </>
                    ) : "Sob consulta"}
                  </p>
                  {price && annual && plan.priceMonthly > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 line-through">
                      R$ {plan.priceMonthly}/mês
                    </p>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={plan.highlight ? "default" : "outline"}
                  className={cn(
                    "w-full gap-1.5 h-12",
                    plan.highlight && "shadow-lg shadow-primary/20"
                  )}
                >
                  <a href={plan.ctaHref || "/signup"}>
                    {plan.cta}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          Mensagens adicionais: <strong>R$ 15 por 1.000</strong> · Todos os planos incluem suporte via WhatsApp
        </p>
      </div>
    </section>
  );
}
