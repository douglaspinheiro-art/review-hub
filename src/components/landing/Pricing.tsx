import { useInView } from "@/hooks/useInView";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Starter",
    price: "Grátis",
    period: "",
    description: "Para começar e testar",
    highlight: false,
    cta: "Criar conta grátis",
    ctaHref: "/signup",
    features: [
      "500 mensagens/mês",
      "200 contatos",
      "1 conexão WhatsApp",
      "Campanhas manuais",
      "Analytics básico",
      "1 integração de e-commerce",
    ],
  },
  {
    name: "Crescimento",
    price: "R$ 197",
    period: "/mês",
    description: "Para e-commerces em expansão",
    highlight: true,
    badge: "Mais popular",
    cta: "Começar trial grátis",
    ctaHref: "/signup",
    features: [
      "10.000 mensagens/mês",
      "5.000 contatos",
      "3 conexões WhatsApp",
      "Campanhas automatizadas",
      "Carrinho abandonado",
      "RFM + segmentação avançada",
      "Chatbot com templates",
      "Gestão de reviews Google",
      "IA para respostas automáticas",
      "Até 5 integrações",
    ],
  },
  {
    name: "Escala",
    price: "R$ 497",
    period: "/mês",
    description: "Para operações de alto volume",
    highlight: false,
    cta: "Começar trial grátis",
    ctaHref: "/signup",
    features: [
      "50.000 mensagens/mês",
      "25.000 contatos",
      "Conexões ilimitadas",
      "Flow builder visual de chatbot",
      "Analytics avançado (cohorts, LTV)",
      "Multi-canal (WhatsApp + SMS + e-mail)",
      "API pública completa",
      "White-label para agências",
      "Gerente de sucesso dedicado",
      "Integrações ilimitadas",
    ],
  },
  {
    name: "Enterprise",
    price: "Sob consulta",
    period: "",
    description: "Para grandes redes e franquias",
    highlight: false,
    cta: "Falar com consultor",
    ctaHref: "/contato",
    features: [
      "Tudo do Escala",
      "Volume de mensagens personalizado",
      "SLA dedicado e suporte 24/7",
      "Infraestrutura dedicada",
      "Integração com ERPs (Bling, SAP)",
      "Benchmark setorial exclusivo",
      "Treinamento e onboarding da equipe",
    ],
  },
];

export default function Pricing() {
  const { ref, inView } = useInView();

  return (
    <section id="planos" ref={ref} className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            "text-center max-w-2xl mx-auto mb-12 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Zap className="w-3.5 h-3.5" />
            14 dias grátis, sem cartão de crédito
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Preços <span className="text-primary">transparentes</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Sem surpresas. Cancele quando quiser. Comece grátis e faça upgrade conforme seu crescimento.
          </p>
        </div>

        <div
          className={cn(
            "grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto transition-all duration-700 delay-150",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative bg-card border rounded-2xl p-6 flex flex-col",
                plan.highlight
                  ? "border-primary ring-2 ring-primary shadow-lg"
                  : "border-border"
              )}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                  {plan.badge}
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-bold text-base">{plan.name}</h3>
                <p className="text-muted-foreground text-xs mt-0.5">{plan.description}</p>
                <p className="mt-3 text-3xl font-extrabold">
                  {plan.price}
                  {plan.period && (
                    <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
                  )}
                </p>
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.highlight ? "default" : "outline"}
                className="w-full gap-1.5"
              >
                <a href={plan.ctaHref}>
                  {plan.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Mensagens adicionais: <strong>R$ 15 por 1.000</strong> · Todos os planos incluem suporte via WhatsApp
        </p>
      </div>
    </section>
  );
}
