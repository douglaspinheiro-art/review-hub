import { useEffect, useState, useRef } from "react";
import {
  CreditCard, Zap, Check, ArrowRight, TrendingUp, Sparkles, X, Loader2, AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getCurrentUserAndStore, useDashboardHomeStats, useProblems } from "@/hooks/useDashboard";
import { CancellationModal } from "@/components/dashboard/CancellationModal";
import { toast } from "sonner";
import { PLAN_LIMITS, PLANS as PRICING_PLANS } from "@/lib/pricing-constants";

const BILLING_PLANS = [
  { key: "starter", name: PRICING_PLANS.starter.name, price: PRICING_PLANS.starter.base, contacts: PRICING_PLANS.starter.maxContacts, messages: PRICING_PLANS.starter.includedWA },
  { key: "growth", name: PRICING_PLANS.growth.name, price: PRICING_PLANS.growth.base, contacts: PRICING_PLANS.growth.maxContacts, messages: PRICING_PLANS.growth.includedWA },
  { key: "scale", name: PRICING_PLANS.scale.name, price: PRICING_PLANS.scale.base, contacts: PRICING_PLANS.scale.maxContacts, messages: PRICING_PLANS.scale.includedWA },
  { key: "enterprise", name: "Enterprise", price: null, contacts: -1, messages: -1 },
] as const;

const supportWaE164 = (import.meta.env.VITE_SUPPORT_WHATSAPP_E164 as string | undefined)?.replace(/\D/g, "") ?? "";
const supportWaHref = supportWaE164
  ? `https://wa.me/${supportWaE164}?text=${encodeURIComponent("Olá! Preciso de ajuda com planos / LTV Boost.")}`
  : null;

export default function Billing() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentPlan = profile?.plan ?? "starter";
  const [showLimitModal, setShowLimitModal] = useState(false);
  const limitModalScheduledRef = useRef(false);
  const limits = PLAN_LIMITS[currentPlan] ?? PLAN_LIMITS.starter;

  const [portalLoading, setPortalLoading] = useState(false);

  const { data: usage } = useQuery({
    queryKey: ["billing_usage", user?.id],
    queryFn: async () => {
      const { storeId, effectiveUserId } = await getCurrentUserAndStore();
      if (!effectiveUserId) throw new Error("Sessão inválida");
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      if (storeId) {
        const [custRes, msgRes] = await Promise.all([
          supabase.from("customers_v3").select("id", { count: "exact", head: true }).eq("store_id", storeId),
          supabase
            .from("message_sends")
            .select("id", { count: "exact", head: true })
            .eq("store_id", storeId)
            .gte("created_at", monthStart),
        ]);

        let messagesSource: "store" | "user" | "unavailable" = "store";
        let msgCount = msgRes.count ?? 0;
        if (msgRes.error) {
          const fb = await supabase
            .from("message_sends")
            .select("id", { count: "exact", head: true })
            .eq("user_id", effectiveUserId)
            .gte("created_at", monthStart);
          if (fb.error) {
            msgCount = 0;
            messagesSource = "unavailable";
          } else {
            msgCount = fb.count ?? 0;
            messagesSource = "user";
          }
        }

        let contactsSource: "store" | "user" | "unavailable" = "store";
        let contactCount = custRes.count ?? 0;
        if (custRes.error) {
          const cfb = await supabase
            .from("customers_v3")
            .select("id", { count: "exact", head: true })
            .eq("user_id", effectiveUserId);
          if (cfb.error) {
            contactCount = 0;
            contactsSource = "unavailable";
          } else {
            contactCount = cfb.count ?? 0;
            contactsSource = "user";
          }
        }

        return {
          contacts: contactCount,
          messages: msgCount,
          scope: "store" as const,
          contactsSource,
          messagesSource,
        };
      }

      const [contactsRes, messagesRes] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId),
        supabase
          .from("messages")
          .select("id, conversations!inner(user_id)", { count: "exact", head: true })
          .eq("conversations.user_id", effectiveUserId)
          .gte("created_at", monthStart),
      ]);
      return {
        contacts: contactsRes.count ?? 0,
        messages: messagesRes.count ?? 0,
        scope: "legacy" as const,
        contactsSource: "legacy" as const,
        messagesSource: "legacy" as const,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: stats } = useDashboardHomeStats(30);
  const { data: problemsQuery } = useProblems();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  useEffect(() => {
    if (limits.contacts < 0) return;
    const usedContacts = usage?.contacts ?? 0;
    const pct = Math.round((usedContacts / limits.contacts) * 100);
    if (pct >= 80 && !limitModalScheduledRef.current) {
      limitModalScheduledRef.current = true;
      const t = window.setTimeout(() => setShowLimitModal(true), 500);
      return () => window.clearTimeout(t);
    }
  }, [usage?.contacts, limits.contacts]);

  const revenueAtRisk = problemsQuery?.totalEstimatedImpact ?? 0;
  const totalRecovered = stats?.revenueLast30 ?? 0;

  const openStripePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string }>("stripe-billing-portal", {
        body: {},
      });
      if (error) throw new Error(error.message);
      const url = data?.url;
      if (!url) throw new Error("URL do portal não retornada. Confirme STRIPE_SECRET_KEY e stripe_customer_id.");
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o portal de faturação.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!user?.id) return;
    setCancelSubmitting(true);
    try {
      const { error } = await supabase.from("billing_cancellation_requests").insert({
        user_id: user.id,
        note: null,
      });
      if (error) throw error;
      setShowCancelModal(false);
      toast.success("Pedido de cancelamento registado. A equipa irá contactá-lo em breve.");
      void queryClient.invalidateQueries({ queryKey: ["billing_usage"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registar o pedido.");
    } finally {
      setCancelSubmitting(false);
    }
  };

  const trialDaysLeft = profile?.trial_ends_at

    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = trialDaysLeft > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Faturação e plano</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie o seu plano e os pagamentos</p>
      </div>

      {usage?.scope === "store" &&
        (usage.contactsSource !== "store" || usage.messagesSource !== "store") && (
        <Alert className="border-amber-500/40 bg-amber-500/[0.07]">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Uso do mês — leitura alternativa</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground space-y-2">
            <p>
              Os totais abaixo podem agregar várias lojas da sua conta ou estar incompletos se a API
              não respondeu à contagem por loja.
            </p>
            <ul className="list-disc pl-4 space-y-1">
              {usage.contactsSource === "user" && (
                <li><strong>Contactos:</strong> total por conta (todas as lojas).</li>
              )}
              {usage.contactsSource === "unavailable" && (
                <li><strong>Contactos:</strong> indisponível neste momento (tente atualizar).</li>
              )}
              {usage.messagesSource === "user" && (
                <li><strong>Mensagens enviadas:</strong> total por conta no mês corrente.</li>
              )}
              {usage.messagesSource === "unavailable" && (
                <li><strong>Mensagens enviadas:</strong> indisponível neste momento.</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {usage?.scope === "legacy" && (
        <Alert className="border-border bg-muted/30">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <AlertTitle className="text-sm">Contagens no modelo clássico</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Sem loja ativa no contexto: os números vêm das tabelas <code className="text-xs">contacts</code> e{" "}
            <code className="text-xs">messages</code> associadas à sua conta.
          </AlertDescription>
        </Alert>
      )}

      {/* Trial banner */}
      {isTrialActive && (
        <div className={cn(
          "border rounded-2xl p-5 space-y-4",
          trialDaysLeft <= 3
            ? "bg-red-500/5 border-red-500/30"
            : trialDaysLeft <= 7
            ? "bg-amber-500/5 border-amber-500/30"
            : "bg-primary/5 border-primary/20"
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  trialDaysLeft <= 3 ? "bg-red-500" : trialDaysLeft <= 7 ? "bg-amber-500" : "bg-primary"
                )} />
                <p className={cn(
                  "font-black text-sm uppercase tracking-widest",
                  trialDaysLeft <= 3 ? "text-red-500" : trialDaysLeft <= 7 ? "text-amber-500" : "text-primary"
                )}>
                  {trialDaysLeft <= 3 ? "⚠️ Trial encerrando" : "Trial gratuito ativo"}
                </p>
              </div>
              <p className="font-bold text-base">
                {trialDaysLeft <= 3
                  ? `Restam apenas ${trialDaysLeft} dias. Após isso, suas automações serão pausadas.`
                  : `Você tem ${trialDaysLeft} dias restantes para testar tudo gratuitamente.`}
              </p>
              <p className="text-sm text-muted-foreground">
                {trialDaysLeft <= 7
                  ? "Faça o upgrade agora para não perder campanhas ativas e histórico de mensagens."
                  : "Nenhuma cobrança até o fim do período. Cancele quando quiser."}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Button
                className="gap-1.5 font-black h-11 px-6 rounded-xl"
                onClick={() => navigate("/dashboard/planos")}
              >
                Fazer upgrade agora <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              {supportWaHref ? (
                <a
                  href={supportWaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center text-xs text-muted-foreground hover:text-primary font-bold underline underline-offset-2 transition-colors"
                >
                  Falar com especialista via WhatsApp
                </a>
              ) : (
                <p className="text-center text-[10px] text-muted-foreground">
                  Defina <code className="text-[10px]">VITE_SUPPORT_WHATSAPP_E164</code> no ambiente para mostrar o link de suporte.
                </p>
              )}
            </div>
          </div>
          {/* Urgency bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Progresso do trial</span>
              <span>{trialDaysLeft} dias restantes</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  trialDaysLeft <= 3 ? "bg-red-500" : trialDaysLeft <= 7 ? "bg-amber-500" : "bg-primary"
                )}
                style={{ width: `${Math.max(5, (trialDaysLeft / 14) * 100)}%` }}
              />
            </div>
          </div>
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
                  <span className={cn("text-muted-foreground", pct > 80 && "text-red-500 font-bold")}>
                    {used.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", pct > 80 ? "bg-red-500" : "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={cn("text-xs", pct > 80 ? "text-red-500 font-semibold" : "text-muted-foreground")}>{pct}% utilizado{pct > 80 && " — limite próximo!"}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planos */}
      <div>
        <h2 className="font-semibold mb-3">Planos disponíveis</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BILLING_PLANS.map((plan) => {
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
                    {plan.price ? `R$ ${plan.price.toLocaleString("pt-BR")}` : "Sob consulta"}
                    <span className="text-xs font-normal text-muted-foreground">{plan.price ? "/mês" : ""}</span>
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
                {isCurrent ? (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    Plano atual
                  </Button>
                ) : supportWaE164 ? (
                  <a
                    href={`https://wa.me/${supportWaE164}?text=${encodeURIComponent(`Quero fazer upgrade para o plano ${plan.name} do LTV Boost`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" className="w-full gap-1 font-bold">
                      Assinar {plan.name} <ArrowRight className="w-3 h-3" />
                    </Button>
                  </a>
                ) : (
                  <Button size="sm" className="w-full gap-1 font-bold" variant="outline" onClick={() => navigate("/dashboard/planos")}>
                    Ver planos <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Revenue Share Model Info */}
      <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Modelo de Sucesso</h2>
          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-primary/30 text-primary">Hybrid</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Nosso modelo alinha os incentivos: você paga uma base fixa acessível e uma pequena taxa sobre a <strong>receita real recuperada</strong> pela plataforma.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 text-center">
          {[
            { label: "Base Fixa (Starter)", value: `R$ ${PRICING_PLANS.starter.base.toLocaleString("pt-BR")}` },
            { label: "Success Fee", value: "3% a 1.5%" },
            { label: "Foco total em", value: "ROI Real" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-background/50 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-bold text-sm mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-400 font-medium">Você só paga a comissão de sucesso sobre as vendas que nós recuperarmos para você (Carrinho, Boleto, PIX).</p>
        </div>
        <Button className="gap-2" onClick={() => navigate("/dashboard/planos")}>
          Ver detalhes dos planos <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Pagamento */}
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Método de pagamento</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Abra o portal seguro da Stripe para atualizar cartão, faturas e dados de faturação (requer{" "}
          <code className="text-xs">stripe_customer_id</code> no perfil e a edge <code className="text-xs">stripe-billing-portal</code>).
        </p>
        <Button variant="outline" className="gap-2" onClick={() => void openStripePortal()} disabled={portalLoading}>
          {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          Abrir portal de faturação
        </Button>
      </div>

      {/* Cancellation section */}
      <div className="pt-10 border-t border-border/40 flex flex-col items-center gap-4">
        <p className="text-xs text-muted-foreground font-medium">Pensando em nos deixar?</p>
        <Button 
          variant="link" 
          className="text-muted-foreground hover:text-red-500 font-bold text-xs decoration-red-500/30"
          onClick={() => setShowCancelModal(true)}
        >
          Cancelar assinatura
        </Button>
      </div>

      {showCancelModal && (
        <CancellationModal
          onClose={() => !cancelSubmitting && setShowCancelModal(false)}
          onConfirm={() => void handleConfirmCancel()}
          revenueAtRisk={revenueAtRisk}
          totalRecovered={totalRecovered}
        />
      )}

      {/* 80% Contact Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-card border rounded-2xl p-8 max-w-sm w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-amber-500" />
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-1" onClick={() => setShowLimitModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black font-syne tracking-tighter">Você está a 80% do limite</h3>
              <p className="text-sm text-muted-foreground">
                Sua base de contatos está quase cheia. Faça upgrade agora para não perder nenhum cliente novo nem pausar suas automações.
              </p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">No plano Scale você teria</p>
              <p className="text-2xl font-black">20.000 contatos</p>
              <p className="text-xs text-muted-foreground">vs. {PLAN_LIMITS[currentPlan].contacts.toLocaleString("pt-BR")} no seu plano atual</p>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 font-black" onClick={() => { setShowLimitModal(false); navigate("/dashboard/planos"); }}>
                Fazer Upgrade <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setShowLimitModal(false)}>Agora não</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
