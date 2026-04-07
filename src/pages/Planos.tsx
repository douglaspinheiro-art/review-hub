import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Check, X, MessageCircle, Zap, Package, BarChart3,
  TrendingUp, AlertTriangle, Users, Mail, Smartphone,
  Info, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { PLANS, BUNDLES, CONTACT_PACK, calcPlano } from "@/lib/pricing-constants";

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MarginBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 50 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
    pct >= 30 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
    "bg-red-500/10 text-red-500 border-red-500/20";
  return (
    <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest", cls)}>
      {fmtPct(pct)}
    </span>
  );
}

// ─── Dados de display ────────────────────────────────────────────────────────

const PLAN_DISPLAY = [
  {
    key: "starter" as const,
    cardClass: "border-border",
    badgeColor: "bg-muted text-muted-foreground border-border",
    ctaLabel: "Começar agora",
    ctaTo: "/signup",
    ctaVariant: "outline" as const,
    feeExamples: [10_000, 30_000, 100_000],
    features: {
      contacts: "1.000",
      instances: "1 instância",
      users: "Até 2 atendentes",
      journeys: "Flow Engine básico",
      rfm: "Básico",
      chs: false,
      aiNegotiator: false,
      forecast: false,
      loyalty: false,
      support: "Chat",
    },
  },
  {
    key: "growth" as const,
    cardClass: "border-blue-500 ring-1 ring-blue-500/30 scale-[1.02]",
    badgeColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    ctaLabel: "Começar agora",
    ctaTo: "/signup",
    ctaVariant: "default" as const,
    feeExamples: [10_000, 30_000, 100_000],
    features: {
      contacts: "5.000",
      instances: "2 instâncias",
      users: "Até 5 atendentes",
      journeys: "Jornadas ilimitadas",
      rfm: "Completo",
      chs: "✓",
      aiNegotiator: "100 conv./mês",
      forecast: "30 dias",
      loyalty: "✓",
      support: "Prioritário",
    },
  },
  {
    key: "scale" as const,
    cardClass: "border-emerald-500 ring-1 ring-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.12)]",
    badgeColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    ctaLabel: "Falar com especialista",
    ctaTo: "/contato",
    ctaVariant: "default" as const,
    feeExamples: [10_000, 30_000, 100_000],
    features: {
      contacts: "10.000",
      instances: "5 instâncias",
      users: "Até 15 atendentes",
      journeys: "Jornadas ilimitadas",
      rfm: "Completo + IA",
      chs: "Multi-loja",
      aiNegotiator: "Ilimitado",
      forecast: "Total + IA",
      loyalty: "✓",
      support: "Onboarding dedicado",
    },
  },
];

const COMPARISON_ROWS = [
  { label: "Base Fixa Mensal" },
  { label: "Success Fee" },
  { label: "WhatsApp Incluso" },
  { label: "E-mail Incluso" },
  { label: "SMS Incluso" },
  { label: "Contatos (Perfil Unificado)" },
  { label: "Instâncias WhatsApp" },
  { label: "Atendentes no Inbox" },
  { label: "Flow Engine" },
  { label: "CHS Score" },
  { label: "Agente IA Negociador" },
  { label: "Revenue Forecast" },
  { label: "Programa de Fidelidade" },
  { label: "Suporte" },
];

// ─── Projeção MRR ─────────────────────────────────────────────────────────────

const REF_CLIENT = {
  starter: calcPlano("starter", { recovered: 5_000 }),
  growth:  calcPlano("growth",  { recovered: 20_000 }),
  scale:   calcPlano("scale",   { recovered: 60_000 }),
};

const MRR_SCENARIOS = [
  { label: "Lançamento",  s: 10, g: 2,  sc: 0  },
  { label: "Crescimento", s: 15, g: 8,  sc: 2  },
  { label: "Aceleração",  s: 10, g: 20, sc: 8  },
  { label: "Escala",      s: 5,  g: 15, sc: 25 },
];

function calcScenario(s: number, g: number, sc: number) {
  const mrrStarter = s  * REF_CLIENT.starter.revTotal;
  const mrrGrowth  = g  * REF_CLIENT.growth.revTotal;
  const mrrScale   = sc * REF_CLIENT.scale.revTotal;
  const mrr        = mrrStarter + mrrGrowth + mrrScale;
  const profit     = s  * REF_CLIENT.starter.grossProfit
                   + g  * REF_CLIENT.growth.grossProfit
                   + sc * REF_CLIENT.scale.grossProfit;
  const margin     = mrr > 0 ? (profit / mrr) * 100 : 0;
  return { mrrStarter, mrrGrowth, mrrScale, mrr, profit, margin };
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface PlanosProps {
  defaultTab?: string;
}

export default function Planos({ defaultTab }: PlanosProps) {
  // Simulador interativo (Aba 3)
  const [simPlan, setSimPlan] = useState<keyof typeof PLANS>("growth");
  const [simRecovered, setSimRecovered] = useState(15_000);
  const [simContacts, setSimContacts] = useState(0);
  const [simBundles, setSimBundles] = useState<string[]>([]);

  const simResult = useMemo(
    () => calcPlano(simPlan, { recovered: simRecovered, contactPacks: simContacts, bundles: simBundles }),
    [simPlan, simRecovered, simContacts, simBundles]
  );

  const toggleBundle = (id: string) =>
    setSimBundles(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);

  const simMarginColor =
    simResult.grossMargin >= 50 ? "text-emerald-500" :
    simResult.grossMargin >= 30 ? "text-amber-500" : "text-red-500";

  const simAlertBg =
    simResult.grossMargin >= 50 ? "bg-emerald-500/5 border-emerald-500/20" :
    simResult.grossMargin >= 30 ? "bg-amber-500/5 border-amber-500/20" :
    "bg-red-500/5 border-red-500/20";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-16 md:py-24 px-4">
        <div className="max-w-6xl mx-auto space-y-10">

          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Zap className="w-3.5 h-3.5" />
              14 dias grátis em qualquer plano
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">Investimento por Resultado</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Sua assinatura se paga em média nas primeiras 48h de operação.
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue={defaultTab ?? "planos"} className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-12 mb-10">
              <TabsTrigger value="planos" className="gap-2 text-xs font-bold">
                <Package className="w-3.5 h-3.5" /> Planos & Limites
              </TabsTrigger>
              <TabsTrigger value="pacotes" className="gap-2 text-xs font-bold">
                <MessageCircle className="w-3.5 h-3.5" /> Pacotes
              </TabsTrigger>
              <TabsTrigger value="simulador" className="gap-2 text-xs font-bold">
                <BarChart3 className="w-3.5 h-3.5" /> Simulador
              </TabsTrigger>
              <TabsTrigger value="mrr" className="gap-2 text-xs font-bold">
                <TrendingUp className="w-3.5 h-3.5" /> Projeção MRR
              </TabsTrigger>
            </TabsList>

            {/* ═══ ABA 1 — PLANOS & LIMITES ══════════════════════════════════ */}
            <TabsContent value="planos" className="space-y-16 focus-visible:outline-none">

              {/* Cards de plano */}
              <div className="grid md:grid-cols-3 gap-6 items-start">
                {PLAN_DISPLAY.map((d) => {
                  const p = PLANS[d.key];
                  const exUsed = Math.round(p.maxContacts * 0.65);
                  return (
                    <div
                      key={d.key}
                      className={cn(
                        "bg-card border rounded-2xl p-6 space-y-5 relative flex flex-col",
                        d.cardClass
                      )}
                    >
                      {/* Header */}
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

                      {/* ① Contatos */}
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

                      {/* ② Mensagens inclusas */}
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

                      {/* ③ Success Fee */}
                      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Success Fee</p>
                          <span className="text-2xl font-black text-primary">
                            {(p.successFeeRate * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Apenas sobre receita recuperada</p>
                        <div className="space-y-1">
                          {d.feeExamples.map((rec) => (
                            <div key={rec} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{fmt(rec)} recuperados →</span>
                              <span className="font-black text-primary">{fmt(rec * p.successFeeRate)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Exemplo de fatura */}
                      <div className="border-t border-dashed pt-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Exemplo de fatura</p>
                        <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-xs">
                          {[
                            { label: "Base Fixa", val: p.base, prefix: "" },
                            { label: "Success Fee (ex.)",    val: d.key === "starter" ? 150 : d.key === "growth" ? 300 : 600, prefix: "+" },
                          ].map(({ label, val, prefix }) => (
                            <div key={label} className="flex justify-between">
                              <span className="text-muted-foreground">{label}</span>
                              <span>{prefix}{fmt(val)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-border/50 pt-1.5 font-black text-sm">
                            <span>Total estimado</span>
                            <span className="text-primary">
                              {fmt(d.key === "starter" ? 597 : d.key === "growth" ? 1197 : 2597)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <Link to={d.ctaTo}>
                          <Button variant={d.ctaVariant} className="w-full font-black py-6 text-base rounded-xl">
                            {d.ctaLabel}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Como funciona o modelo */}
              <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 bg-muted/20 border rounded-3xl p-8">
                <div className="space-y-3">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" /> Como funciona o Success Fee?
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Nós ganhamos quando você ganha. O percentual é cobrado apenas sobre vendas <strong>diretamente recuperadas</strong> por nossas automações — carrinho abandonado, boletos e PIX. Se não recuperarmos nada, você não paga comissão.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-emerald-500" /> Custos de Excedente
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {[
                      { label: "WhatsApp", price: "R$ 0,50/msg" },
                      { label: "E-mail",   price: "R$ 0,01/msg" },
                      { label: "SMS",      price: "R$ 0,20/msg" },
                      { label: "Evolution API", price: "Incluso" },
                    ].map(({ label, price }) => (
                      <div key={label} className="space-y-0.5">
                        <p className="font-bold uppercase tracking-widest opacity-40">{label}</p>
                        <p className="text-base font-black">{price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Enterprise */}
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="space-y-3 text-center md:text-left">
                  <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary">Enterprise</Badge>
                  <h2 className="text-3xl font-bold">Acima de R$ 2M/mês?</h2>
                  <p className="text-muted-foreground max-w-lg">
                    Soluções sob medida com instâncias ilimitadas, treinamento de IA com seus dados e Customer Success Manager dedicado.
                  </p>
                </div>
                <div className="space-y-2 text-center md:text-right shrink-0">
                  <p className="text-sm text-muted-foreground font-medium">A partir de</p>
                  <p className="text-3xl font-black">R$ 3.497<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                  <Link to="/contato">
                    <Button size="lg" className="mt-2 px-8">Falar com consultor</Button>
                  </Link>
                </div>
              </div>

              {/* Tabela comparativa */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-center">Comparativo completo</h2>
                <div className="bg-card border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-5 py-4 font-medium text-muted-foreground w-2/5">Recurso</th>
                          {PLAN_DISPLAY.map((d) => (
                            <th key={d.key} className="text-center px-4 py-4 font-bold">{PLANS[d.key].emoji} {PLANS[d.key].name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {COMPARISON_ROWS.map(({ label }, i) => {
                          const vals = PLAN_DISPLAY.map((d) => {
                            const p = PLANS[d.key];
                            if (label === "Base Fixa Mensal") return fmt(p.base);
                            if (label === "Success Fee") return `${(p.successFeeRate * 100).toFixed(0)}%`;
                            if (label === "WhatsApp Incluso") return `${fmtN(p.includedWA)} msgs`;
                            if (label === "E-mail Incluso") return `${fmtN(p.includedEmail)} emails`;
                            if (label === "SMS Incluso") return p.includedSMS > 0 ? `${fmtN(p.includedSMS)} msgs` : "—";
                            if (label === "Contatos (Perfil Unificado)") return fmtN(p.maxContacts);
                            return (d.features as any)[
                              label === "Instâncias WhatsApp"  ? "instances"    :
                              label === "Atendentes no Inbox"  ? "users"        :
                              label === "Flow Engine"          ? "journeys"     :
                              label === "CHS Score"            ? "chs"          :
                              label === "Agente IA Negociador" ? "aiNegotiator" :
                              label === "Revenue Forecast"     ? "forecast"     :
                              label === "Programa de Fidelidade" ? "loyalty"    :
                              "support"
                            ];
                          });
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

              {/* FAQ + CTA final */}
              <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {[
                  { q: "Preciso de cartão de crédito para testar?", a: "Não. O trial de 14 dias é 100% gratuito, sem necessidade de cartão." },
                  { q: "Posso mudar de plano depois?", a: "Sim, upgrade ou downgrade a qualquer momento. O valor é ajustado proporcionalmente." },
                  { q: "O que acontece quando o trial acaba?", a: "Você escolhe um plano. Se não assinar, o acesso é pausado e seus dados ficam salvos por 30 dias." },
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
                  Comece a recuperar vendas hoje — sem contrato de fidelidade.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Link to="/signup"><Button size="lg">Começar grátis agora</Button></Link>
                  <Link to="/contato"><Button variant="outline" size="lg">Falar com especialista</Button></Link>
                </div>
              </div>
            </TabsContent>

            {/* ═══ ABA 2 — PACOTES DE MENSAGENS ══════════════════════════════ */}
            <TabsContent value="pacotes" className="space-y-12 focus-visible:outline-none">

              {(["wa", "email", "sms"] as const).map((channel) => {
                const channelMeta = {
                  wa:    { label: "WhatsApp",  icon: Smartphone, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", note: null },
                  email: { label: "E-mail",    icon: Mail,       color: "text-blue-500",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    note: null },
                  sms:   { label: "SMS",       icon: MessageCircle, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20",
                    note: "SMS tem margens menores. Recomendado apenas para lojas no plano Scale com volume elevado." },
                }[channel];
                const Icon = channelMeta.icon;

                return (
                  <div key={channel} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", channelMeta.bg, channelMeta.border, "border")}>
                        <Icon className={cn("w-5 h-5", channelMeta.color)} />
                      </div>
                      <h2 className="text-xl font-bold">{channelMeta.label}</h2>
                    </div>

                    {channelMeta.note && (
                      <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-sm text-amber-600">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{channelMeta.note}</span>
                      </div>
                    )}

                    <div className="grid md:grid-cols-3 gap-4">
                      {BUNDLES[channel].map((b) => {
                        const profit = b.price - b.qty * b.costPerUnit;
                        const margin = b.price > 0 ? (profit / b.price) * 100 : 0;
                        return (
                          <div key={b.id} className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-black text-base">{b.name}</p>
                                <p className="text-sm text-muted-foreground">{fmtN(b.qty)} mensagens</p>
                              </div>
                              <MarginBadge pct={margin} />
                            </div>

                            <div className="space-y-2 text-sm">
                              {[
                                { label: "Preço cobrado",  val: fmt(b.price), bold: true },
                                { label: "Custo real",     val: fmt(b.qty * b.costPerUnit), muted: true },
                                { label: "Lucro bruto",    val: fmt(profit), color: profit >= 0 ? "text-emerald-500" : "text-red-500" },
                              ].map(({ label, val, bold, muted, color }) => (
                                <div key={label} className="flex justify-between">
                                  <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
                                  <span className={cn(bold && "font-black", color)}>{val}</span>
                                </div>
                              ))}
                            </div>

                            <ProgressBar
                              value={Math.max(0, profit)}
                              max={b.price}
                              color={margin >= 50 ? "bg-emerald-500" : margin >= 30 ? "bg-amber-500" : "bg-red-500"}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Contatos extras */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/10 border border-violet-500/20">
                    <Users className="w-5 h-5 text-violet-500" />
                  </div>
                  <h2 className="text-xl font-bold">Contatos Extras</h2>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-5 max-w-sm space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-black text-base">+1.000 Contatos</p>
                      <p className="text-sm text-muted-foreground">Por pacote</p>
                    </div>
                    <MarginBadge pct={((CONTACT_PACK.price - CONTACT_PACK.cost) / CONTACT_PACK.price) * 100} />
                  </div>
                  {[
                    { label: "Preço cobrado", val: fmt(CONTACT_PACK.price), bold: true },
                    { label: "Custo real",    val: fmt(CONTACT_PACK.cost), muted: true },
                    { label: "Lucro bruto",   val: fmt(CONTACT_PACK.price - CONTACT_PACK.cost), color: "text-emerald-500" },
                  ].map(({ label, val, bold, muted, color }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
                      <span className={cn(bold && "font-black", color)}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabela resumo */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold">Resumo — todos os pacotes</h3>
                <div className="bg-card border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          {["Pacote", "Qtd", "Preço", "Custo", "Lucro", "Margem"].map((h) => (
                            <th key={h} className={cn("px-4 py-3 font-semibold text-muted-foreground", h === "Pacote" ? "text-left" : "text-center")}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...BUNDLES.wa, ...BUNDLES.email, ...BUNDLES.sms,
                          { id: "ct", name: "Contatos +1k", qty: CONTACT_PACK.qty, price: CONTACT_PACK.price, costPerUnit: CONTACT_PACK.cost / CONTACT_PACK.qty },
                        ].map((b, i) => {
                          const cost   = b.qty * b.costPerUnit;
                          const profit = b.price - cost;
                          const margin = b.price > 0 ? (profit / b.price) * 100 : 0;
                          return (
                            <tr key={b.id} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/20")}>
                              <td className="px-4 py-3 font-medium">{b.name}</td>
                              <td className="px-4 py-3 text-center text-muted-foreground">{fmtN(b.qty)}</td>
                              <td className="px-4 py-3 text-center font-bold">{fmt(b.price)}</td>
                              <td className="px-4 py-3 text-center text-muted-foreground">{fmt(cost)}</td>
                              <td className={cn("px-4 py-3 text-center font-bold", profit >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(profit)}</td>
                              <td className="px-4 py-3 text-center"><MarginBadge pct={margin} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ═══ ABA 3 — SIMULADOR INTERATIVO ══════════════════════════════ */}
            <TabsContent value="simulador" className="focus-visible:outline-none space-y-8">

              {/* Seletor de plano */}
              <div className="space-y-3">
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Selecione o plano</p>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key) => {
                    const p = PLANS[key];
                    const active = simPlan === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSimPlan(key)}
                        className={cn(
                          "p-4 rounded-2xl border text-left transition-all duration-200",
                          active
                            ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                            : "border-border/50 hover:border-primary/30 bg-card"
                        )}
                      >
                        <p className="text-lg font-black">{p.emoji} {p.name}</p>
                        <p className="text-sm text-muted-foreground">{fmt(p.base)}/mês</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{p.audience}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Coluna inputs */}
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold">Receita recuperada/mês</label>
                      <span className="text-primary font-black font-mono text-sm">{fmt(simRecovered)}</span>
                    </div>
                    <Slider
                      value={[simRecovered]}
                      onValueChange={([v]) => setSimRecovered(v)}
                      min={0} max={500_000} step={1_000}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Success fee: <span className="font-bold text-primary">{fmt(simRecovered * PLANS[simPlan].successFeeRate)}</span>
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold">Pacotes extras de contatos</label>
                      <span className="font-black font-mono text-sm">{simContacts}× (+{fmtN(simContacts * CONTACT_PACK.qty)})</span>
                    </div>
                    <Slider
                      value={[simContacts]}
                      onValueChange={([v]) => setSimContacts(v)}
                      min={0} max={20} step={1}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Base total: <span className="font-bold">{fmtN(PLANS[simPlan].maxContacts + simContacts * CONTACT_PACK.qty)} contatos</span>
                    </p>
                  </div>

                  {(["wa", "email", "sms"] as const).map((ch) => {
                    const meta = { wa: { label: "Pacotes WhatsApp", color: "text-emerald-500" }, email: { label: "Pacotes E-mail", color: "text-blue-500" }, sms: { label: "Pacotes SMS", color: "text-amber-500" } }[ch];
                    return (
                      <div key={ch} className="space-y-2">
                        <p className="text-sm font-bold">{meta.label}</p>
                        <div className="space-y-2">
                          {BUNDLES[ch].map((b) => (
                            <label key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 cursor-pointer hover:border-primary/30 transition-colors">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={simBundles.includes(b.id)}
                                  onChange={() => toggleBundle(b.id)}
                                  className="w-4 h-4 accent-primary"
                                />
                                <span className="text-sm font-medium">{b.name}</span>
                              </div>
                              <span className={cn("text-sm font-black", meta.color)}>{fmt(b.price)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Coluna resultado */}
                <div className="space-y-6">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Receita Total",  val: fmt(simResult.revTotal),    color: "text-foreground" },
                      { label: "Lucro Bruto",    val: fmt(simResult.grossProfit), color: simResult.grossProfit >= 0 ? "text-emerald-500" : "text-red-500" },
                      { label: "COGS Total",     val: fmt(simResult.cogsTotal),   color: "text-muted-foreground" },
                      { label: "Margem Bruta",   val: fmtPct(simResult.grossMargin), color: simMarginColor },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-card border border-border/50 rounded-2xl p-4 space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
                        <p className={cn("text-xl font-black font-mono", color)}>{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Composição da receita */}
                  <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Composição da Receita</p>
                    {[
                      { label: "Base Fixa",    val: simResult.revBase,     color: "bg-primary" },
                      { label: "Success Fee",  val: simResult.revSuccess,  color: "bg-emerald-500" },
                      { label: "Contatos",     val: simResult.revContacts, color: "bg-blue-500" },
                      { label: "Pacotes",      val: simResult.revBundles,  color: "bg-amber-500" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-bold">{fmt(val)}</span>
                        </div>
                        <ProgressBar value={val} max={simResult.revTotal || 1} color={color} />
                      </div>
                    ))}
                  </div>

                  {/* Composição do COGS */}
                  <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Composição do COGS</p>
                    {[
                      { label: "COGS Fixo",    val: simResult.cogsFixed },
                      { label: "Pacotes",      val: simResult.cogsBundles },
                      { label: "Gateway (2,5%)", val: simResult.cogsGW },
                    ].map(({ label, val }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-bold">{fmt(val)}</span>
                        </div>
                        <ProgressBar value={val} max={simResult.cogsTotal || 1} color="bg-red-500/60" />
                      </div>
                    ))}
                  </div>

                  {/* Alerta de margem */}
                  <div className={cn("border rounded-2xl p-4 flex items-start gap-3", simAlertBg)}>
                    {simResult.grossMargin >= 50
                      ? <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    }
                    <div>
                      <p className={cn("text-sm font-black", simMarginColor)}>
                        Margem de {fmtPct(simResult.grossMargin)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {simResult.grossMargin >= 50
                          ? "Excelente! Esta combinação é altamente lucrativa."
                          : simResult.grossMargin >= 30
                          ? "Margem aceitável. Considere reduzir pacotes SMS para melhorar."
                          : "Margem baixa ou negativa. Revise a combinação de pacotes."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                Projeções baseadas em benchmarks reais do mercado brasileiro. Usamos estimativa conservadora para não criar expectativas acima do que entregamos.
              </p>
            </TabsContent>

            {/* ═══ ABA 4 — PROJEÇÃO DE MRR ════════════════════════════════════ */}
            <TabsContent value="mrr" className="focus-visible:outline-none space-y-10">

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Projeção de MRR por Mix de Clientes</h2>
                <p className="text-muted-foreground text-sm">
                  Valores de referência assumem receita recuperada média por porte de loja.
                </p>
              </div>

              {/* Tabela de cenários */}
              <div className="bg-card border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {["Cenário", "🌱 Starter", "🚀 Growth", "⚡ Scale", "MRR Total", "Lucro Bruto", "Margem"].map((h) => (
                          <th key={h} className={cn("px-4 py-4 font-semibold text-muted-foreground", h === "Cenário" ? "text-left" : "text-center")}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MRR_SCENARIOS.map((sc, i) => {
                        const r = calcScenario(sc.s, sc.g, sc.sc);
                        return (
                          <tr key={sc.label} className={cn("border-b last:border-0", i % 2 === 1 && "bg-muted/20")}>
                            <td className="px-4 py-4 font-black">{sc.label}</td>
                            <td className="px-4 py-4 text-center text-muted-foreground">{sc.s} clientes<br /><span className="text-xs font-bold">{fmt(r.mrrStarter)}</span></td>
                            <td className="px-4 py-4 text-center text-muted-foreground">{sc.g} clientes<br /><span className="text-xs font-bold">{fmt(r.mrrGrowth)}</span></td>
                            <td className="px-4 py-4 text-center text-muted-foreground">{sc.sc} clientes<br /><span className="text-xs font-bold">{fmt(r.mrrScale)}</span></td>
                            <td className="px-4 py-4 text-center font-black text-primary">{fmt(r.mrr)}</td>
                            <td className="px-4 py-4 text-center font-bold text-emerald-500">{fmt(r.profit)}</td>
                            <td className="px-4 py-4 text-center"><MarginBadge pct={r.margin} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Premissas */}
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground bg-muted/20 rounded-2xl p-4">
                {[
                  { plan: "🌱 Starter", ref: "R$5k recuperados/mês" },
                  { plan: "🚀 Growth",  ref: "R$20k recuperados/mês" },
                  { plan: "⚡ Scale",   ref: "R$60k recuperados/mês" },
                ].map(({ plan, ref }) => (
                  <div key={plan}><span className="font-bold">{plan}:</span> {ref} (referência)</div>
                ))}
              </div>

              {/* Cards de margem nos excedentes */}
              <div>
                <h3 className="text-lg font-bold mb-4">Margem nos excedentes (por mensagem)</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    {
                      label: "WhatsApp Excedente",
                      icon: Smartphone,
                      price: 0.50, cost: 0.036,
                      color: "text-emerald-500", bg: "bg-emerald-500/5", border: "border-emerald-500/20",
                      note: "Maior margem do portfólio. Incentive pacotes WA nos planos Starter e Growth.",
                    },
                    {
                      label: "E-mail Excedente",
                      icon: Mail,
                      price: 0.01, cost: 0.0055,
                      color: "text-blue-500", bg: "bg-blue-500/5", border: "border-blue-500/20",
                      note: "Volume alto compensa margem menor. Ideal para campanhas de reativação.",
                    },
                    {
                      label: "SMS Excedente",
                      icon: MessageCircle,
                      price: 0.20, cost: 0.10,
                      color: "text-amber-500", bg: "bg-amber-500/5", border: "border-amber-500/20",
                      note: "Recomendado somente para Scale. Custo de operadora é alto.",
                    },
                  ].map(({ label, icon: Icon, price, cost, color, bg, border, note }) => {
                    const margin = ((price - cost) / price) * 100;
                    return (
                      <div key={label} className={cn("border rounded-2xl p-5 space-y-4", bg, border)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={cn("w-5 h-5", color)} />
                            <span className="font-bold text-sm">{label}</span>
                          </div>
                          <MarginBadge pct={margin} />
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span className="text-muted-foreground">Preço</span><span className="font-bold">{fmt(price)}/msg</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Custo</span><span>{fmt(cost)}/msg</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Lucro</span><span className={cn("font-black", color)}>{fmt(price - cost)}/msg</span></div>
                        </div>
                        <ProgressBar value={price - cost} max={price} color={margin >= 50 ? "bg-emerald-500" : "bg-amber-500"} />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{note}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                Projeções baseadas em benchmarks reais do mercado brasileiro. Estimativa conservadora para não criar expectativas acima do que entregamos.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
