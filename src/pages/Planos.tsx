import { lazy, Suspense, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Check, X, MessageCircle, Zap, Users, Mail, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { PLANS } from "@/lib/pricing-constants";
import { useAuth } from "@/hooks/useAuth";

const CalculadoraSimulador = lazy(() => import("./Calculadora"));

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (n: number) => n.toLocaleString("pt-BR");
function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const PLAN_ORDER = ["starter", "growth", "scale"] as const;
type PlanKey = (typeof PLAN_ORDER)[number];

/** Só classes CTA e destaque visual — números e textos de produto vêm de `PLANS[*].planPage`. */
const PLAN_CARD_SHELL: {
  key: PlanKey;
  cardClass: string;
  badgeColor: string;
  ctaLabel: string;
  ctaTo: string;
  ctaVariant: "outline" | "default";
}[] = [
  {
    key: "starter",
    cardClass: "border-border",
    badgeColor: "bg-muted text-muted-foreground border-border",
    ctaLabel: "Começar agora",
    ctaTo: "/signup",
    ctaVariant: "outline",
  },
  {
    key: "growth",
    cardClass: "border-blue-500 ring-1 ring-blue-500/30 scale-[1.02]",
    badgeColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    ctaLabel: "Começar agora",
    ctaTo: "/signup",
    ctaVariant: "default",
  },
  {
    key: "scale",
    cardClass: "border-emerald-500 ring-1 ring-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.12)]",
    badgeColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    ctaLabel: "Falar com especialista",
    ctaTo: "/contato",
    ctaVariant: "default",
  },
];

const COMPARISON_ROWS = [
  { label: "Base Fixa Mensal" },
  { label: "Success Fee" },
  { label: "WhatsApp Incluso" },
  { label: "E-mail Incluso" },
  { label: "SMS Incluso" },
  { label: "Contatos (Perfil Unificado)" },
  { label: "Lojas" },
  { label: "Usuários" },
  { label: "Automações" },
  { label: "Previsão de receita" },
  { label: "A/B em Prescrições" },
  { label: "Fidelidade Completa" },
  { label: "Agente IA (Conversas)" },
  { label: "API + White-label" },
];

function comparisonValue(label: string, planKey: PlanKey): string | boolean {
  const p = PLANS[planKey];
  const m = p.planPage;
  if (label === "Base Fixa Mensal") return fmt(p.base);
  if (label === "Success Fee") return `${(p.successFeeRate * 100).toFixed(0)}%`;
  if (label === "WhatsApp Incluso") return `${fmtN(p.includedWA)} msgs`;
  if (label === "E-mail Incluso") return `${fmtN(p.includedEmail)} emails`;
  if (label === "SMS Incluso") return p.includedSMS > 0 ? `${fmtN(p.includedSMS)} msgs` : "—";
  if (label === "Contatos (Perfil Unificado)") return fmtN(p.maxContacts);
  if (label === "Lojas") return m.instances;
  if (label === "Usuários") return m.users;
  if (label === "Automações") return m.journeys;
  if (label === "Previsão de receita") return m.revenueForecast;
  if (label === "A/B em Prescrições") return m.abPrescriptions;
  if (label === "Fidelidade Completa") return m.loyalty;
  if (label === "Agente IA (Conversas)") return m.aiNegotiator;
  if (label === "API + White-label") return m.support;
  return "—";
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Planos({
  embedInDashboard,
  defaultTab,
}: { embedInDashboard?: boolean; defaultTab?: string } = {}) {
  const [tab, setTab] = useState<"planos" | "simulador">(() =>
    defaultTab === "simulador" ? "simulador" : "planos"
  );
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const isActive = profile?.subscription_status === "active";
  const currentPlanKey: PlanKey | null =
    isActive && (profile?.plan === "starter" || profile?.plan === "growth" || profile?.plan === "scale")
      ? profile.plan
      : null;
  const recommendedParam = searchParams.get("recommended");
  const fromDiagnostico = searchParams.get("from") === "diagnostico";
  const recommendedKey: PlanKey | null =
    recommendedParam === "growth" || recommendedParam === "scale" || recommendedParam === "starter"
      ? recommendedParam
      : null;

  return (
    <div className={cn("flex flex-col bg-background", embedInDashboard ? "min-h-0" : "min-h-screen")}>
      {!embedInDashboard && <Header />}

      <main className={cn("flex-1 px-4", embedInDashboard ? "py-6 md:py-8" : "py-16 md:py-24")}>
        <div className="max-w-6xl mx-auto space-y-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "planos" | "simulador")} className="w-full">
            <TabsList
              className={cn(
                "grid w-full max-w-md mx-auto h-auto p-1 rounded-xl",
                embedInDashboard ? "mb-6" : "mb-8",
              )}
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              <TabsTrigger value="planos" className="rounded-lg font-bold text-xs py-2.5">
                Planos e preços
              </TabsTrigger>
              <TabsTrigger value="simulador" className="rounded-lg font-bold text-xs py-2.5">
                Simulador de impacto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="simulador" className="mt-0 space-y-4 outline-none">
              <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto">
                Estime receita recuperável com base no seu tráfego e ticket. Os valores são ilustrativos.
              </p>
              <Suspense
                fallback={
                  <div className="flex justify-center py-16 text-muted-foreground text-sm">
                    A carregar simulador…
                  </div>
                }
              >
                <CalculadoraSimulador />
              </Suspense>
            </TabsContent>

            <TabsContent value="planos" className="mt-0 space-y-10 outline-none">
          {fromDiagnostico && recommendedKey && (
            <div className="max-w-3xl mx-auto bg-primary/10 border border-primary/30 rounded-2xl p-5 text-center space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Plano recomendado para você
              </p>
              <p className="text-sm text-foreground">
                Com base no seu diagnóstico, o plano <strong>{PLANS[recommendedKey].name}</strong> cobre o gargalo principal e libera o painel completo.
              </p>
            </div>
          )}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Zap className="w-3.5 h-3.5" />
              {fromDiagnostico ? "Ative seu diagnóstico — sem trial em planos pagos" : "Investimento por resultado"}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">Investimento por Resultado</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Cobrança orientada por valor incremental capturado. Sua assinatura se paga em média nas primeiras 48h de operação.
            </p>
          </div>

          <div className="space-y-16">

              <div className="grid md:grid-cols-3 gap-6 items-start">
                {PLAN_CARD_SHELL.map((d) => {
                  const p = PLANS[d.key];
                  const m = p.planPage;
                  const exUsed = Math.round(p.maxContacts * 0.65);
                  const isRecommended = recommendedKey === d.key;
                  const isCurrent = currentPlanKey === d.key;
                  return (
                    <div
                      key={d.key}
                      className={cn(
                        "bg-card border rounded-2xl p-6 space-y-5 relative flex flex-col",
                        d.cardClass,
                        isCurrent && "ring-2 ring-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.18)]",
                        !isCurrent && isRecommended && "ring-2 ring-primary shadow-[0_0_40px_rgba(16,185,129,0.18)] scale-[1.03]"
                      )}
                    >
                      {isCurrent && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                          Seu plano atual
                        </span>
                      )}
                      {!isCurrent && isRecommended && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                          Recomendado para você
                        </span>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                            {p.emoji} {p.name}
                          </p>
                          <div className="flex items-end gap-1">
                            <span className="text-4xl font-black tracking-tighter">{fmt(p.base)}</span>
                            <span className="text-muted-foreground text-sm mb-1">/mês</span>
                          </div>
                        </div>
                        <span className={cn("text-[9px] border px-2 py-0.5 rounded-full font-black uppercase tracking-widest shrink-0 mt-1", d.badgeColor)}>
                          {p.audience}
                        </span>
                      </div>

                      <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <Users className="w-3 h-3" /> Contatos
                          </p>
                          <span className="text-lg font-black font-mono">{fmtN(p.maxContacts)}</span>
                        </div>
                        <ProgressBar value={exUsed} max={p.maxContacts} color="bg-primary/70" />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{fmtN(exUsed)} utilizados (ex.)</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mensagens inclusas</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { icon: Smartphone, label: "WhatsApp", val: fmtN(p.includedWA), color: "text-emerald-500" },
                            { icon: Mail,       label: "E-mail",   val: fmtN(p.includedEmail), color: "text-blue-500" },
                            { icon: MessageCircle, label: "SMS",   val: p.includedSMS > 0 ? fmtN(p.includedSMS) : "—", color: "text-amber-500" },
                          ].map(({ icon: Icon, label, val, color }) => (
                            <div key={label} className="bg-background/60 rounded-xl p-2.5 text-center border border-border/50">
                              <Icon className={cn("w-3.5 h-3.5 mx-auto mb-1", color)} />
                              <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
                              <p className="text-xs font-black">{val}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Success Fee</p>
                          <span className="text-2xl font-black text-primary">
                            {(p.successFeeRate * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Apenas sobre receita recuperada</p>
                        <div className="space-y-1">
                          {m.feeExamples.map((rec) => (
                            <div key={rec} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{fmt(rec)} recuperados →</span>
                              <span className="font-black text-primary">{fmt(rec * p.successFeeRate)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-dashed pt-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Exemplo de fatura</p>
                        <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-xs">
                          {[
                            { label: "Base Fixa", val: p.base, prefix: "" },
                            { label: "Success Fee (est.)", val: m.invoiceSuccessFeeSample, prefix: "+" },
                          ].map(({ label, val, prefix }) => (
                            <div key={label} className="flex justify-between">
                              <span className="text-muted-foreground">{label}</span>
                              <span>{prefix}{fmt(val)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-border/50 pt-1.5 font-black text-sm">
                            <span>Total estimado</span>
                            <span className="text-primary">
                              {fmt(m.invoiceTotalExample)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        {isCurrent ? (
                          <Link to="/dashboard/billing">
                            <Button variant="outline" className="w-full font-black py-6 text-base rounded-xl border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10">
                              Gerenciar assinatura
                            </Button>
                          </Link>
                        ) : (
                          <Link to={d.ctaTo}>
                            <Button variant={d.ctaVariant} className="w-full font-black py-6 text-base rounded-xl">
                              {isActive ? "Mudar para este plano" : d.ctaLabel}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-center">Comparativo completo</h2>
                <div className="bg-card border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-5 py-4 font-medium text-muted-foreground w-2/5">Recurso</th>
                          {PLAN_ORDER.map((key) => (
                            <th key={key} className="text-center px-4 py-4 font-bold">{PLANS[key].emoji} {PLANS[key].name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {COMPARISON_ROWS.map(({ label }, i) => {
                          const vals = PLAN_ORDER.map((key) => comparisonValue(label, key));
                          return (
                            <tr key={label} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/20")}>
                              <td className="px-5 py-3 text-muted-foreground text-sm">{label}</td>
                              {vals.map((val, vi) => (
                                <td key={vi} className="px-4 py-3 text-center text-sm">
                                  {val === true  ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> :
                                   val === false ? <X className="w-4 h-4 text-muted-foreground/40 mx-auto" /> :
                                   <span className="font-medium">{String(val)}</span>}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {[
                  { q: "Preciso de cartão de crédito para o diagnóstico?", a: "Não. O diagnóstico é 100% gratuito, sem necessidade de cartão." },
                  { q: "Posso mudar de plano depois?", a: "Sim, upgrade ou downgrade a qualquer momento. O valor é ajustado proporcionalmente." },
                  { q: "O que acontece após o diagnóstico?", a: "Você escolhe um plano para ativar a execução. Sem assinatura, o acesso à plataforma fica pausado e seus dados ficam salvos por 30 dias." },
                  { q: "As mensagens do WhatsApp têm custo extra?", a: "Além da assinatura há o custo da API Meta. Ajudamos na configuração." },
                ].map(({ q, a }) => (
                  <div key={q} className="space-y-1">
                    <p className="font-semibold text-sm">{q}</p>
                    <p className="text-sm text-muted-foreground">{a}</p>
                  </div>
                ))}
              </div>

              <div className="text-center space-y-4 bg-primary/5 border border-primary/20 rounded-2xl py-12 px-6">
                <h2 className="text-2xl font-bold">Pronto para recuperar receita perdida?</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Faça seu diagnóstico grátis e veja quanto você pode recuperar — sem contrato de fidelidade.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Link to="/diagnostico"><Button size="lg">Fazer diagnóstico grátis</Button></Link>
                  <Link to="/contato"><Button variant="outline" size="lg">Falar com especialista</Button></Link>
                </div>
              </div>
          </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {!embedInDashboard && <Footer />}
    </div>
  );
}
