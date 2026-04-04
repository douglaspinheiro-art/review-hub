import { CreditCard, Zap, Check, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: "Grátis",
    period: "",
    contacts: 200,
    messages: 500,
  },
  {
    key: "growth",
    name: "Crescimento",
    price: "R$ 197",
    period: "/mês",
    contacts: 5000,
    messages: 10000,
  },
  {
    key: "scale",
    name: "Escala",
    price: "R$ 497",
    period: "/mês",
    contacts: 25000,
    messages: 50000,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Sob consulta",
    period: "",
    contacts: -1,
    messages: -1,
  },
];

const PLAN_LIMITS: Record<string, { contacts: number; messages: number }> = {
  starter: { contacts: 200, messages: 500 },
  growth: { contacts: 5000, messages: 10000 },
  scale: { contacts: 25000, messages: 50000 },
  enterprise: { contacts: -1, messages: -1 },
};

export default function Billing() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const currentPlan = profile?.plan ?? "starter";
  const limits = PLAN_LIMITS[currentPlan];

  // Fix BUG-005: fetch real usage counts
  const { data: usage } = useQuery({
    queryKey: ["billing_usage", user?.id],
    queryFn: async () => {
      const [contactsRes, messagesRes] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase.from("messages").select("id", { count: "exact", head: true })
          .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      return {
        contacts: contactsRes.count ?? 0,
        messages: messagesRes.count ?? 0,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = trialDaysLeft > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie seu plano e pagamentos</p>
      </div>

      {/* Trial banner */}
      {isTrialActive && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Trial gratuito ativo</p>
            <p className="text-sm text-muted-foreground">
              Você tem <strong>{trialDaysLeft} dias</strong> restantes no seu trial. Faça upgrade para continuar usando após o período.
            </p>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => navigate("/planos")}>
            Fazer upgrade <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Uso do mês */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">
            Uso em {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { label: "Contatos", used: usage?.contacts ?? 0, total: limits.contacts },
            { label: "Mensagens enviadas", used: usage?.messages ?? 0, total: limits.messages },
          ].map(({ label, used, total }) => {
            if (total < 0) {
              return (
                <div key={label} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">Ilimitado</span>
                  </div>
                  <div className="h-2 bg-primary/20 rounded-full" />
                </div>
              );
            }
            const pct = Math.round((used / total) * 100);
            return (
              <div key={label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground">
                    {used.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", pct > 80 ? "bg-red-500" : "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{pct}% utilizado</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planos */}
      <div>
        <h2 className="font-semibold mb-3">Planos disponíveis</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            return (
              <div
                key={plan.key}
                className={cn(
                  "bg-card border rounded-xl p-4 space-y-3",
                  isCurrent ? "border-primary ring-1 ring-primary" : ""
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        Atual
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold mt-1.5">
                    {plan.price}
                    <span className="text-xs font-normal text-muted-foreground">{plan.period}</span>
                  </p>
                </div>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {[
                    plan.contacts < 0 ? "Contatos ilimitados" : `${plan.contacts.toLocaleString("pt-BR")} contatos`,
                    plan.messages < 0 ? "Mensagens ilimitadas" : `${plan.messages.toLocaleString("pt-BR")} msgs/mês`,
                    "Suporte via WhatsApp",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                  disabled={isCurrent}
                  onClick={() => !isCurrent && navigate("/planos")}
                >
                  {isCurrent ? "Plano atual" : "Fazer upgrade"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagamento */}
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Método de pagamento</h2>
        </div>
        <p className="text-sm text-muted-foreground">Gerenciamento de pagamentos via Stripe em breve.</p>
        <Button variant="outline" disabled className="gap-2">
          <CreditCard className="w-4 h-4" />
          Adicionar cartão
        </Button>
      </div>
    </div>
  );
}
