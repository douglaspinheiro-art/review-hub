import { useNavigate } from "react-router-dom";
import { Check, Zap, ShieldCheck, ArrowRight, Lock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: "R$ 497",
    period: "/mês",
    audience: "Lojas até R$ 80k/mês",
    highlight: false,
    badge: null,
    features: [
      "150 msgs WhatsApp/mês",
      "1.500 e-mails inclusos",
      "1.000 clientes no perfil",
      "Radar de Lucro",
      "Carrinho + PIX automático",
      "1 integração e-commerce",
      "Suporte via chat",
    ],
    cta: "Ativar Starter",
    ctaVariant: "outline" as const,
  },
  {
    key: "growth",
    name: "Growth",
    price: "R$ 997",
    period: "/mês",
    audience: "Lojas até R$ 500k/mês",
    highlight: true,
    badge: "Mais popular",
    features: [
      "500 msgs WhatsApp/mês",
      "5.000 e-mails inclusos",
      "5.000 clientes no perfil",
      "CHS Score + Prescrições IA",
      "Agente IA Negociador",
      "Até 3 integrações",
      "Suporte prioritário",
    ],
    cta: "Ativar Growth",
    ctaVariant: "default" as const,
  },
  {
    key: "scale",
    name: "Scale",
    price: "R$ 2.497",
    period: "/mês",
    audience: "Lojas acima de R$ 500k/mês",
    highlight: false,
    badge: null,
    features: [
      "2.000 msgs WhatsApp/mês",
      "15.000 e-mails inclusos",
      "3.000 SMS inclusos",
      "10.000 clientes no perfil",
      "Previsão de receita completa",
      "Relatório executivo semanal PDF",
      "API & Webhooks ilimitados",
    ],
    cta: "Ativar Scale",
    ctaVariant: "outline" as const,
  },
];

export default function Upgrade() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-16 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] font-black tracking-[0.3em] px-5 py-2 rounded-full uppercase">
            <Lock className="w-3 h-3" />
            Acesso de demonstração ativo
          </div>

          {trialDaysLeft > 0 ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>
                Seu acesso de demonstração expira em{" "}
                <span className="font-black text-foreground">{trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"}</span>
              </span>
            </div>
          ) : null}

          <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter uppercase italic">
            Ative seu plano e <span className="text-primary">recupere vendas</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Seu diagnóstico está pronto. Escolha o plano certo e a IA começa a trabalhar imediatamente.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-500 font-bold">
            <Zap className="w-4 h-4 fill-emerald-500" />
            Sua assinatura se paga nas primeiras 48h de operação.
          </div>
        </div>

        {/* Plans */}
        <div className="grid sm:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={cn(
                "relative bg-card border rounded-2xl p-6 flex flex-col transition-all",
                plan.highlight
                  ? "border-primary ring-2 ring-primary shadow-2xl shadow-primary/10 scale-[1.03]"
                  : "border-border"
              )}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                  {plan.badge}
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-black text-lg tracking-tight">{plan.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.audience}</p>
                <div className="mt-3">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-sm text-muted-foreground font-medium">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.ctaVariant}
                className={cn(
                  "w-full font-black gap-1.5 rounded-xl h-12",
                  plan.highlight && "shadow-lg shadow-primary/20"
                )}
                onClick={() => navigate("/dashboard/billing")}
              >
                {plan.cta} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Enterprise row */}
        <div className="border border-border/50 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-black text-lg">Enterprise</h3>
              <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-black border-amber-500/30 text-amber-600">
                A partir de R$ 5.000/mês
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Grandes redes, franquias e volumes personalizados — SLA 99.9%, white-label, CS dedicado.
            </p>
          </div>
          <Button variant="outline" className="shrink-0 font-black gap-2" asChild>
            <a href="/contato?assunto=enterprise">Falar com consultor <ArrowRight className="w-4 h-4" /></a>
          </Button>
        </div>

        {/* Guarantee */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="font-black text-sm mb-1">Garantia de resultado em 30 dias</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se o LTV Boost não recuperar ao menos o valor da mensalidade nos primeiros 30 dias, você recebe desconto integral no mês seguinte.
              Cancele quando quiser, sem multa ou fidelidade.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Continuar explorando a demonstração
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
