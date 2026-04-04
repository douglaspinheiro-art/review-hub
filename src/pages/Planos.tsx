import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, MessageCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    monthlyPrice: 0,
    yearlyPrice: 0,
    badge: "14 dias grátis em qualquer plano",
    badgeColor: "bg-muted text-muted-foreground",
    cardClass: "border-border",
    ctaLabel: "Começar grátis",
    ctaVariant: "outline" as const,
    features: {
      contacts: "200",
      messages: "500 msgs/mês WhatsApp",
      journeys: "3 jornadas automáticas",
      rfm: true,
      campaigns: true,
      aiCopy: false,
      emailSms: false,
      churnPrediction: false,
      loyaltyProgram: false,
      whiteLabel: false,
      api: false,
      users: "1 usuário",
      support: "Suporte via chat",
      csm: false,
    },
  },
  {
    key: "growth",
    name: "Crescimento",
    monthlyPrice: 197,
    yearlyPrice: 164,
    badge: "Mais Popular",
    badgeColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    cardClass: "border-blue-500 ring-1 ring-blue-500/30 scale-[1.02]",
    ctaLabel: "Começar grátis",
    ctaVariant: "default" as const,
    features: {
      contacts: "5.000",
      messages: "10.000 msgs/mês WhatsApp",
      journeys: "Jornadas ilimitadas",
      rfm: true,
      campaigns: true,
      aiCopy: true,
      emailSms: true,
      churnPrediction: true,
      loyaltyProgram: false,
      whiteLabel: false,
      api: false,
      users: "5 usuários",
      support: "Suporte prioritário",
      csm: false,
    },
  },
  {
    key: "scale",
    name: "Escala",
    monthlyPrice: 497,
    yearlyPrice: 414,
    badge: "Para escalar de verdade",
    badgeColor: "bg-green-500/10 text-green-500 border-green-500/20",
    cardClass: "border-green-500 ring-1 ring-green-500/30 shadow-[0_0_30px_rgba(16,185,129,0.15)]",
    ctaLabel: "Falar com especialista",
    ctaVariant: "default" as const,
    features: {
      contacts: "25.000",
      messages: "50.000 msgs/mês WhatsApp",
      journeys: "Jornadas ilimitadas",
      rfm: true,
      campaigns: true,
      aiCopy: true,
      emailSms: true,
      churnPrediction: true,
      loyaltyProgram: true,
      whiteLabel: true,
      api: true,
      users: "Usuários ilimitados",
      support: "Suporte dedicado",
      csm: true,
    },
  },
];

const COMPARISON_ROWS = [
  { label: "Contatos", key: "contacts", type: "text" },
  { label: "Mensagens WhatsApp", key: "messages", type: "text" },
  { label: "Jornadas Automáticas", key: "journeys", type: "text" },
  { label: "Segmentação RFM", key: "rfm", type: "bool" },
  { label: "Biblioteca de campanhas", key: "campaigns", type: "bool" },
  { label: "IA Copywriter", key: "aiCopy", type: "bool" },
  { label: "Email + SMS", key: "emailSms", type: "bool" },
  { label: "Predição de churn", key: "churnPrediction", type: "bool" },
  { label: "Programa de Fidelidade", key: "loyaltyProgram", type: "bool" },
  { label: "Relatórios white-label", key: "whiteLabel", type: "bool" },
  { label: "Acesso à API", key: "api", type: "bool" },
  { label: "Usuários", key: "users", type: "text" },
  { label: "Suporte", key: "support", type: "text" },
  { label: "CSM dedicado", key: "csm", type: "bool" },
] as const;

export default function Planos() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto space-y-16">
          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Zap className="w-3.5 h-3.5" />
              14 dias grátis em qualquer plano
            </div>
            <h1 className="text-3xl md:text-5xl font-bold">Escolha seu plano</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Comece gratuitamente e escale conforme sua loja cresce. Sem surpresas.
            </p>

            {/* Toggle anual/mensal */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <span className={cn("text-sm font-medium", !annual && "text-foreground", annual && "text-muted-foreground")}>Mensal</span>
              <button
                onClick={() => setAnnual(!annual)}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  annual ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                    annual && "translate-x-6"
                  )}
                />
              </button>
              <span className={cn("text-sm font-medium flex items-center gap-1.5", annual && "text-foreground", !annual && "text-muted-foreground")}>
                Anual
                <span className="text-[10px] bg-green-500/10 text-green-600 border border-green-500/20 px-1.5 py-0.5 rounded-full font-semibold">
                  2 meses grátis
                </span>
              </span>
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => {
              const price = annual ? plan.yearlyPrice : plan.monthlyPrice;
              const priceLabel = price === 0 ? "Grátis" : `R$ ${price}`;
              return (
                <div
                  key={plan.key}
                  className={cn(
                    "bg-card border rounded-2xl p-6 space-y-6 relative",
                    plan.cardClass
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h2 className="text-xl font-bold">{plan.name}</h2>
                      <span className={cn("text-[11px] border px-2 py-0.5 rounded-full font-medium shrink-0", plan.badgeColor)}>
                        {plan.badge}
                      </span>
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-bold">{priceLabel}</span>
                      {price > 0 && <span className="text-muted-foreground text-sm mb-1">/mês</span>}
                    </div>
                    {annual && price > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Cobrado R$ {(price * 12).toLocaleString("pt-BR")}/ano
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {[
                      plan.features.contacts + " contatos",
                      plan.features.messages,
                      plan.features.journeys,
                      plan.features.rfm && "Segmentação RFM",
                      plan.features.aiCopy && "IA Copywriter",
                      plan.features.emailSms && "Email + SMS",
                      plan.features.loyaltyProgram && "Programa de Fidelidade",
                      plan.features.whiteLabel && "Relatórios white-label",
                      plan.features.api && "Acesso à API",
                      plan.features.users,
                    ].filter(Boolean).map((f) => (
                      <li key={f as string} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link to={plan.key === "scale" ? "/contato" : "/signup"} className="block">
                    <Button variant={plan.ctaVariant} className="w-full">
                      {plan.ctaLabel}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Tabela comparativa */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-center">Comparativo completo</h2>
            <div className="bg-card border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-5 py-4 font-medium text-muted-foreground w-1/2">Recurso</th>
                      {PLANS.map((p) => (
                        <th key={p.key} className="text-center px-4 py-4 font-semibold">{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map(({ label, key, type }, i) => (
                      <tr key={key} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/20")}>
                        <td className="px-5 py-3 text-muted-foreground">{label}</td>
                        {PLANS.map((p) => {
                          const val = p.features[key];
                          return (
                            <td key={p.key} className="px-4 py-3 text-center">
                              {type === "bool" ? (
                                val ? (
                                  <Check className="w-4 h-4 text-green-500 mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                                )
                              ) : (
                                <span className="font-medium">{val as string}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* FAQ rápido */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {[
              { q: "Preciso de cartão de crédito para testar?", a: "Não. O trial de 14 dias é 100% gratuito, sem necessidade de cartão." },
              { q: "Posso mudar de plano depois?", a: "Sim, você pode fazer upgrade ou downgrade a qualquer momento. O valor é ajustado proporcionalmente." },
              { q: "O que acontece quando o trial acaba?", a: "Você escolhe um plano para continuar. Se não assinar, o acesso é pausado e seus dados ficam salvos por 30 dias." },
              { q: "As mensagens do WhatsApp têm custo extra?", a: "Sim, além da assinatura há o custo da API do WhatsApp Business (Meta). Ajudamos na configuração." },
            ].map(({ q, a }) => (
              <div key={q} className="space-y-1">
                <p className="font-semibold text-sm">{q}</p>
                <p className="text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>

          {/* CTA final */}
          <div className="text-center space-y-4 bg-primary/5 border border-primary/20 rounded-2xl py-12 px-6">
            <div className="flex items-center justify-center gap-2">
              <MessageCircle className="w-6 h-6 text-primary" />
              <span className="font-bold text-lg">LTV Boost</span>
            </div>
            <h2 className="text-2xl font-bold">Pronto para recuperar receita perdida?</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Junte-se a mais de 1.200 lojistas que já usam o LTV Boost para vender mais.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link to="/signup">
                <Button size="lg">Começar grátis agora</Button>
              </Link>
              <Link to="/contato">
                <Button variant="outline" size="lg">Falar com especialista</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
