import { useState } from "react";
import { useInView } from "@/hooks/useInView";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUNDLES, PLANS, getAnnualPrice } from "@/lib/pricing-constants";

const LANDING_PLANS = [
  {
    key: "starter" as const,
    badge: undefined,
    highlight: false,
    cta: "Iniciar trial de 14 dias",
  },
  {
    key: "growth" as const,
    highlight: true,
    badge: "Mais popular",
    cta: "Iniciar trial de 14 dias",
  },
  {
    key: "scale" as const,
    highlight: false,
    cta: "Iniciar trial de 14 dias",
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
            Planos para operar <span className="text-gradient">retencao com previsibilidade</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-6">
            Feito para e-commerces de R$30k a R$3M/mes. Voce paga pela base e expande conforme captura mais lucro incremental.
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
          {LANDING_PLANS.map((entry) => {
            const plan = PLANS[entry.key];
            const monthlyPrice = plan.base;
            const yearlyPrice = getAnnualPrice(monthlyPrice);
            const price = annual ? yearlyPrice : monthlyPrice;
            return (
              <div
                key={plan.name}
                className={cn(
                  "relative bg-card border rounded-2xl p-7 flex flex-col",
                  entry.highlight
                    ? "border-primary ring-2 ring-primary/30 shadow-xl shadow-primary/10"
                    : "border-border/50"
                )}
              >
                {entry.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap shadow-lg shadow-primary/30">
                    {entry.badge}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-display font-bold text-lg">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm mt-0.5">{plan.landingDescription}</p>
                  <p className="mt-4 text-4xl font-display font-extrabold">
                    R$ {price}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  {annual && (
                    <p className="text-xs text-muted-foreground mt-1 line-through">
                      R$ {monthlyPrice}/mês
                    </p>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.landingFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={entry.highlight ? "default" : "outline"}
                  className={cn(
                    "w-full gap-1.5 h-12",
                    entry.highlight && "shadow-lg shadow-primary/20"
                  )}
                >
                  <a href="/signup">
                    {entry.cta}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          Mensagens adicionais: <strong>R$ {BUNDLES.wa[1].price} por {BUNDLES.wa[1].qty.toLocaleString("pt-BR")}</strong> · Todos os planos incluem suporte via WhatsApp
        </p>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Add-ons disponiveis no dashboard: benchmark preditivo, autopilot de retencao e governanca multi-loja.
        </p>
      </div>
    </section>
  );
}
