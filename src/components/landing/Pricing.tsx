import { useState } from "react";
import { useInView } from "@/hooks/useInView";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Zap, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Starter",
    price: "R$ 447",
    period: "/mês",
    description: "Lojas até R$ 80k/mês",
    highlight: false,
    badge: "Success Fee: 3%",
    feeExample: "Ex: recuperou R$ 5k → paga R$ 150 de fee",
    cta: "Começar agora",
    ctaHref: "/signup",
    features: [
      "3% sobre receita recuperada",
      "150 msgs WhatsApp inclusas",
      "1.500 e-mails inclusos",
      "1.000 clientes no perfil",
      "Radar de Lucro Básico",
      "Flow Engine (Carrinho/PIX)",
      "1 integração e-commerce",
    ],
  },
  {
    name: "Growth",
    price: "R$ 897",
    period: "/mês",
    description: "Lojas até R$ 500k/mês",
    highlight: true,
    badge: "Success Fee: 2%",
    feeExample: "Ex: recuperou R$ 20k → paga R$ 400 de fee",
    cta: "Começar agora",
    ctaHref: "/signup",
    features: [
      "2% sobre receita recuperada",
      "500 msgs WhatsApp inclusas",
      "5.000 e-mails inclusos",
      "5.000 clientes no perfil",
      "CHS Score + Prescrições",
      "Agente IA Negociador",
      "Até 3 integrações",
    ],
  },
  {
    name: "Scale",
    price: "R$ 1.997",
    period: "/mês",
    description: "Lojas acima de R$ 500k/mês",
    highlight: false,
    badge: "Success Fee: 1%",
    feeExample: "Ex: recuperou R$ 100k → paga R$ 1.000 de fee",
    cta: "Começar agora",
    ctaHref: "/signup",
    features: [
      "1% sobre receita recuperada",
      "2.000 msgs WhatsApp inclusas",
      "15.000 e-mails inclusos",
      "3.000 SMS inclusos",
      "10.000 clientes no perfil",
      "Revenue Forecast Total",
      "Relatório executivo semanal em PDF",
      "API & Webhooks ilimitados",
    ],
  },
  {
    name: "Enterprise",
    price: "A partir de R$ 5.000",
    period: "/mês",
    description: "Grandes redes e franquias",
    highlight: false,
    badge: undefined,
    feeExample: "Taxas e limites negociados conforme volume e SLA",
    cta: "Falar com consultor",
    ctaHref: "/contato",
    features: [
      "Taxas personalizadas",
      "Volume de msgs ilimitado",
      "Treinamento de IA sob medida",
      "SLA de 99.9% e Suporte 24/7",
      "Integração com ERPs",
      "Customer Success dedicado",
      "Relatórios white-label",
    ],
  },
];

const ANNUAL_DISCOUNT = 0.20; // 20% off

function applyDiscount(price: string, annual: boolean): string {
  if (!annual || price === "Custom" || price.startsWith("A partir")) return price;
  const num = parseInt(price.replace(/\D/g, ""), 10);
  const discounted = Math.round(num * (1 - ANNUAL_DISCOUNT));
  return `R$ ${discounted.toLocaleString("pt-BR")}`;
}

export default function Pricing() {
  const { ref, inView } = useInView();
  const [annual, setAnnual] = useState(false);

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
          <h2 className="text-3xl md:text-5xl font-black font-syne tracking-tighter uppercase italic mb-4">
            Investimento em <span className="text-primary">Inteligência</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-4">
            Sua assinatura se paga em média nas primeiras 48h de operação.
          </p>

          {/* Annual / Monthly toggle */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <span className={cn("text-sm font-bold transition-colors", !annual ? "text-foreground" : "text-muted-foreground")}>
              Mensal
            </span>
            <button
              onClick={() => setAnnual(a => !a)}
              className={cn(
                "relative w-12 h-6 rounded-full border transition-all duration-300",
                annual ? "bg-primary border-primary" : "bg-muted border-border"
              )}
            >
              <span className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300",
                annual ? "left-6" : "left-0.5"
              )} />
            </button>
            <span className={cn("text-sm font-bold transition-colors flex items-center gap-1.5", annual ? "text-foreground" : "text-muted-foreground")}>
              Anual
              <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                -20%
              </span>
            </span>
          </div>
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
                <p className="mt-3 flex items-end gap-1.5">
                  <span className="text-3xl font-extrabold">{applyDiscount(plan.price, annual)}</span>
                  {plan.period && (
                    <span className="text-sm font-normal text-muted-foreground pb-0.5">{plan.period}</span>
                  )}
                </p>
                {annual && plan.price !== "Custom" && !plan.price.startsWith("A partir") && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-through">{plan.price}/mês</p>
                )}
              </div>

              <ul className="space-y-2.5 mb-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              {plan.feeExample && (
                <p className="text-[10px] text-muted-foreground/60 italic bg-muted/40 rounded-lg px-3 py-2 mb-4 leading-relaxed">
                  {plan.feeExample}
                </p>
              )}

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

        {/* Guarantee & Risk Reversal */}
        <div className={cn(
          "mt-12 max-w-2xl mx-auto bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left transition-all duration-700 delay-300",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <div className="shrink-0 w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="font-bold text-sm mb-1">Garantia de resultado em 30 dias</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se o LTV Boost não recuperar ao menos o valor da sua mensalidade nos primeiros 30 dias, você recebe desconto integral no mês seguinte. Cancele quando quiser, sem multa ou fidelidade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
