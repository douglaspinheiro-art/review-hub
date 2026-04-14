// @ts-nocheck Supabase types.ts is read-only and misaligned with the live DB schema
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, ArrowRight, CheckCircle2, AlertCircle,
  TrendingUp, Smartphone, MessageCircle, BarChart3,
  Globe, Loader2,
  Check, Info, RefreshCw, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { calcDiagnostico, recoveryProgressPercent, recoveryPercentLabel, MIN_TICKET_MEDIO } from "@/lib/diagnostico-logic";
import { PLANS, BUNDLES, CONTACT_PACK, calcPlano } from "@/lib/pricing-constants";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { ECOMMERCE_PLATFORMAS } from "@/lib/ecommerce-platforms";
import { toast } from "sonner";
import { fetchStoreMetricsForDiagnostico, StoreMetricsQueryError } from "@/lib/fetch-store-metrics-client";
import { trackDiagnosticoEvent } from "@/lib/analytics-events";

const WIZARD_STORAGE_KEY = "ltv_diagnostico_wizard_v1";

type WizardFormPersist = {
  nome: string;
  segmento: string;
  plataforma: string;
  faturamento: number;
  clientes: number;
  ticketMedio: number;
  canais: string[];
  taxaAbandono: number;
};

type WizardPersistV1 = {
  v: 1;
  step: number;
  subStep: 1 | 2;
  formData: WizardFormPersist;
};

function readWizardState(): WizardPersistV1 | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<WizardPersistV1>;
    if (p?.v !== 1 || typeof p.step !== "number" || typeof p.subStep !== "number") return null;
    if (!p.formData || typeof p.formData !== "object") return null;
    return p as WizardPersistV1;
  } catch {
    return null;
  }
}

function writeWizardState(payload: { step: number; subStep: 1 | 2; formData: WizardFormPersist }) {
  try {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ v: 1, ...payload }));
  } catch {
    /* quota / private mode */
  }
}

function clearWizardState() {
  try {
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify", nuvemshop: "Nuvemshop", woocommerce: "WooCommerce",
  tray: "Tray", vtex: "VTEX",
};

const SEGMENTOS = [
  "Moda", "Calçados", "Beleza & Cosméticos", "Eletrônicos", 
  "Casa & Decoração", "Alimentos & Bebidas", "Suplementos", 
  "Esportes", "Pets", "Outros"
];

const CANAIS = [
  { id: "wa", label: "WhatsApp", icon: MessageCircle },
  { id: "email", label: "E-mail", icon: Globe },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "none", label: "Nenhum", icon: BarChart3 },
];

const LOADING_STEP_ITEMS = [
  { text: "Calculando perdas estimadas a partir dos seus números…", Icon: BarChart3 },
  { text: "Estimando volume de mensagens por canal…", Icon: Smartphone },
  { text: "Montando a recomendação de plano…", Icon: Zap },
] as const;

const LOADING_STEPS_COUNT = LOADING_STEP_ITEMS.length;

export default function Diagnostico({ embedInDashboard }: { embedInDashboard?: boolean } = {}) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);

  const persisted = useMemo(
    () => (typeof sessionStorage !== "undefined" ? readWizardState() : null),
    []
  );

  async function handleSelectPlan(key: string, isSuggested: boolean) {
    setSavingPlan(key);
    try {
      if (user) {
        // Escolha persistida no perfil para onboarding; com faturação Stripe ativa, limites e produto efetivo devem seguir o webhook de subscrição.
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ plan: key, onboarding_completed: true })
          .eq("id", user.id);
        if (profileErr) {
          trackDiagnosticoEvent("diagnostico_plan_save_failed", { reason: "profile", plan: key });
          toast.error(`Não foi possível salvar o plano: ${profileErr.message}`);
          return;
        }

        const { data: existingStore, error: storeSelectErr } = await supabase
          .from("stores")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (storeSelectErr) {
          trackDiagnosticoEvent("diagnostico_plan_save_failed", { reason: "store_select", plan: key });
          toast.error(`Não foi possível verificar sua loja: ${storeSelectErr.message}`);
          return;
        }

        if (!existingStore) {
          const { error: insertErr } = await supabase.from("stores").insert({
            user_id: user.id,
            name: formData.nome || profile?.company_name || "Minha Loja",
            segment: formData.segmento
          });
          if (insertErr) {
            trackDiagnosticoEvent("diagnostico_plan_save_failed", { reason: "store_insert", plan: key });
            toast.error(`Não foi possível criar a loja: ${insertErr.message}`);
            return;
          }
        }
      }
      clearWizardState();
      trackDiagnosticoEvent("diagnostico_plan_selected", { plan: key });
      navigate(`/dashboard${isSuggested ? "?setup=novo" : ""}`);
    } catch (err) {
      console.error("Error saving plan/store:", err);
      toast.error("Algo deu errado ao salvar. Tente novamente.");
    } finally {
      setSavingPlan(null);
    }
  }

  const [step, setStep] = useState(() =>
    persisted && persisted.step >= 1 && persisted.step <= 4 ? persisted.step : 1
  );
  const [subStep, setSubStep] = useState<1 | 2>(() =>
    persisted?.subStep === 1 || persisted?.subStep === 2 ? persisted.subStep : 1
  );
  const [realDataLoaded, setRealDataLoaded] = useState(false);

  const [formData, setFormData] = useState<WizardFormPersist>(() => {
    const base: WizardFormPersist = {
      nome: "",
      segmento: "Moda",
      plataforma: "Shopify",
      faturamento: 50000,
      clientes: 5000,
      ticketMedio: 150,
      canais: [] as string[],
      taxaAbandono: 0.7,
    };
    if (persisted?.formData) {
      return {
        ...base,
        ...persisted.formData,
        canais: Array.isArray(persisted.formData.canais) ? persisted.formData.canais : [],
      };
    }
    return base;
  });

  useEffect(() => {
    if (!profile?.company_name) return;
    setFormData(prev => {
      if (prev.nome.trim()) return prev;
      return { ...prev, nome: profile.company_name };
    });
  }, [profile?.company_name]);

  useEffect(() => {
    writeWizardState({ step, subStep, formData });
  }, [step, subStep, formData]);

  useEffect(() => {
    trackDiagnosticoEvent("diagnostico_step_view", { step });
  }, [step]);

  useEffect(() => {
    const suffix = embedInDashboard ? "Simulador · LTV Boost" : "Simulador de receita · LTV Boost";
    const stepPart =
      step === 1
        ? subStep === 1
          ? "Passo 1 — Sobre a loja"
          : "Passo 1 — Números"
        : step === 2
          ? "Passo 2 — A calcular"
          : step === 3
            ? "Passo 3 — Resultado"
            : "Passo 4 — Planos";
    document.title = `${stepPart} | ${suffix}`;
    const id = window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [step, subStep, embedInDashboard]);

  // Busca dados reais da loja se usuário tem integração ativa
  const { data: storeMetrics, isLoading: isLoadingMetrics, error: metricsError, refetch: refetchMetrics } = useQuery({
    queryKey: ["store-metrics", user?.id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new StoreMetricsQueryError("Sessão não disponível.", "unauthorized");
      }
      return fetchStoreMetricsForDiagnostico(supabase, session.access_token);
    },
    enabled: !!user,
    retry: (failureCount, err) => {
      if (err instanceof StoreMetricsQueryError) {
        if (err.kind === "unauthorized" || err.kind === "no_integration" || err.kind === "unsupported") {
          return false;
        }
      }
      return failureCount < 2;
    },
    staleTime: 5 * 60_000,
  });

  // Pré-preenche formulário quando dados reais chegam
  useEffect(() => {
    if (storeMetrics && !realDataLoaded) {
      setFormData(prev => ({
        ...prev,
        nome: profile?.company_name || prev.nome,
        plataforma: PLATFORM_LABELS[storeMetrics.plataforma] || prev.plataforma,
        faturamento: Math.round(storeMetrics.faturamento),
        clientes: storeMetrics.totalClientes || prev.clientes,
        ticketMedio: Math.round(storeMetrics.ticketMedio) || prev.ticketMedio,
        taxaAbandono: storeMetrics.taxaAbandono,
      }));
      setRealDataLoaded(true);
    }
  }, [storeMetrics, realDataLoaded, profile]);

  // Etapa 2 Loading items
  const [loadingStep, setLoadingStep] = useState(0);

  // Etapa 4 Simulation state
  const [simRecuperada, setSimRecuperada] = useState(0);
  const [simWA, setSimWA] = useState(0);
  const [simEmail, setSimEmail] = useState(0);
  const [simContacts, setSimContacts] = useState(0);

  const diagnostico = useMemo(() => {
    return calcDiagnostico({
      faturamento: formData.faturamento,
      clientes: formData.clientes,
      ticketMedio: formData.ticketMedio,
      taxaAbandono: formData.taxaAbandono,
      segmento: formData.segmento
    });
  }, [formData]);

  useEffect(() => {
    if (step === 2) {
      setLoadingStep(0);
      const interval = setInterval(() => {
        setLoadingStep(prev => {
          if (prev < LOADING_STEPS_COUNT - 1) return prev + 1;
          clearInterval(interval);
          setTimeout(() => setStep(3), 500);
          return prev;
        });
      }, 700);
      return () => clearInterval(interval);
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      setSimRecuperada(diagnostico.receitaRecuperadaTotal);
    }
  }, [step, diagnostico.receitaRecuperadaTotal]);

  const formatCurrency = (val: number) => 
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatNumber = (val: number) =>
    val.toLocaleString("pt-BR");

  const renderStep1 = () => (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Banner: dados reais da loja */}
      {user && (() => {
        const bannerTone = isLoadingMetrics
          ? "bg-muted/30 border-border/40 text-muted-foreground"
          : storeMetrics
            ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
            : metricsError
            ? "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400"
            : "bg-muted/30 border-border/40 text-muted-foreground";

        let inner: ReactNode = null;
        if (isLoadingMetrics) {
          inner = (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
              <span role="status" aria-live="polite">Buscando dados reais da sua loja…</span>
            </>
          );
        } else if (storeMetrics) {
          inner = (
            <>
              <Link2 className="w-4 h-4 shrink-0" aria-hidden />
              <span>
                <strong>Pré-preenchido com dados reais</strong> de {PLATFORM_LABELS[storeMetrics.plataforma] || storeMetrics.plataforma} — últimos 30 dias. Ajuste se necessário.
              </span>
              <button
                type="button"
                onClick={() => refetchMetrics()}
                className="ml-auto shrink-0 hover:opacity-70 transition-opacity"
                aria-label="Atualizar dados da loja"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </>
          );
        } else if (metricsError) {
          const err = metricsError as Error;
          if (err instanceof StoreMetricsQueryError) {
            if (err.kind === "no_integration") {
              inner = (
                <>
                  <Info className="w-4 h-4 shrink-0" aria-hidden />
                  <span>Sem integração de loja ativa — preencha os dados manualmente.</span>
                  <a href="/dashboard/integracoes" className="ml-auto shrink-0 text-xs font-bold underline underline-offset-2 hover:no-underline">
                    Conectar loja →
                  </a>
                </>
              );
            } else if (err.kind === "unauthorized") {
              inner = (
                <>
                  <Info className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{err.message}</span>
                </>
              );
            } else if (err.kind === "empty_response") {
              inner = (
                <>
                  <Info className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{err.message}</span>
                </>
              );
            } else if (err.kind === "unsupported") {
              inner = (
                <>
                  <Info className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{err.message}</span>
                </>
              );
            } else if (err.kind === "network") {
              inner = (
                <>
                  <Info className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{err.message}</span>
                  <button type="button" onClick={() => refetchMetrics()} className="ml-auto shrink-0 text-xs font-bold underline" aria-label="Tentar buscar métricas novamente">
                    Tentar de novo
                  </button>
                </>
              );
            } else {
              inner = (
                <>
                  <Info className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{err.message}</span>
                  <button type="button" onClick={() => refetchMetrics()} className="ml-auto shrink-0 text-xs font-bold underline" aria-label="Tentar buscar métricas novamente">
                    Tentar de novo
                  </button>
                </>
              );
            }
          } else {
            inner = (
              <>
                <Info className="w-4 h-4 shrink-0" aria-hidden />
                <span>Não foi possível carregar métricas da loja. Preencha os dados manualmente.</span>
                <button type="button" onClick={() => refetchMetrics()} className="ml-auto shrink-0 text-xs font-bold underline" aria-label="Tentar buscar métricas novamente">
                  Tentar de novo
                </button>
              </>
            );
          }
        }

        if (!inner) return null;
        return (
          <div className={cn("rounded-2xl border px-5 py-3 flex items-center gap-3 text-sm transition-all", bannerTone)}>
            {inner}
          </div>
        );
      })()}

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2
              ref={stepHeadingRef}
              tabIndex={-1}
              className="text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
            >
              {subStep === 1 ? "Sobre a sua loja" : "Seus números"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {subStep === 1
                ? "Contexto básico para calibrar o diagnóstico"
                : "Usamos isso para calcular sua perda real"}
            </p>
          </div>
          <span className="text-sm text-muted-foreground font-medium shrink-0">
            Etapa 1{subStep === 2 ? "b" : "a"} de 4
          </span>
        </div>
        <Progress value={subStep === 1 ? 12 : 25} className="h-2" aria-label={`Progresso do assistente, etapa 1${subStep === 2 ? "b" : "a"} de 4`} />
      </div>

      {subStep === 1 ? (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da loja</Label>
              <Input
                id="nome"
                placeholder="Minha Loja"
                value={formData.nome}
                onChange={e => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segmento">Segmento</Label>
              <Select
                value={formData.segmento}
                onValueChange={v => setFormData(prev => ({ ...prev, segmento: v }))}
              >
                <SelectTrigger id="segmento"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SEGMENTOS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plataforma">Plataforma de e-commerce</Label>
              <Select
                value={formData.plataforma}
                onValueChange={v => setFormData(prev => ({ ...prev, plataforma: v }))}
              >
                <SelectTrigger id="plataforma"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ECOMMERCE_PLATFORMAS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket">Ticket médio por pedido (R$)</Label>
              <Input
                id="ticket"
                type="number"
                min={MIN_TICKET_MEDIO}
                value={formData.ticketMedio}
                onChange={e => setFormData(prev => ({
                  ...prev,
                  ticketMedio: Math.max(MIN_TICKET_MEDIO, Number(e.target.value) || MIN_TICKET_MEDIO),
                }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Canais de marketing que você usa hoje</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CANAIS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    const newCanais = formData.canais.includes(id)
                      ? formData.canais.filter(c => c !== id)
                      : [...formData.canais, id];
                    setFormData(prev => ({ ...prev, canais: newCanais }));
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 border-2 rounded-xl transition-all gap-2",
                    formData.canais.includes(id)
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-bold">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            data-testid="diagnostico-continuar-numeros"
            className="w-full h-14 text-lg font-black rounded-2xl gap-2"
            onClick={() => setSubStep(2)}
            disabled={!formData.nome}
          >
            Continuar — Seus números <ArrowRight className="w-5 h-5" />
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label>Faturamento médio mensal</Label>
                  {realDataLoaded && <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[9px] font-black px-1.5">REAL</Badge>}
                </div>
                <span className="font-bold text-primary">{formatCurrency(formData.faturamento)}</span>
              </div>
              <div className="flex gap-4 items-center">
                <Slider
                  value={[formData.faturamento]}
                  min={10000} max={2000000} step={5000}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, faturamento: v }))}
                  className="flex-1"
                />
                <Input
                  type="number" className="w-32"
                  value={formData.faturamento}
                  onChange={e => setFormData(prev => ({ ...prev, faturamento: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label>Clientes ativos na base</Label>
                  {realDataLoaded && storeMetrics?.totalClientes > 0 && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[9px] font-black px-1.5">REAL</Badge>
                  )}
                </div>
                <span className="font-bold text-primary">{formatNumber(formData.clientes)}</span>
              </div>
              <div className="flex gap-4 items-center">
                <Slider
                  value={[formData.clientes]}
                  min={100} max={50000} step={100}
                  onValueChange={([v]) => setFormData(prev => ({ ...prev, clientes: v }))}
                  className="flex-1"
                />
                <Input
                  type="number" className="w-32"
                  value={formData.clientes}
                  onChange={e => setFormData(prev => ({ ...prev, clientes: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label>Taxa de abandono de carrinho estimada</Label>
                  {realDataLoaded && storeMetrics?.plataforma === "shopify" && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[9px] font-black px-1.5">REAL</Badge>
                  )}
                </div>
                <span className="font-bold text-primary">{Math.round(formData.taxaAbandono * 100)}%</span>
              </div>
              <Slider
                value={[formData.taxaAbandono * 100]}
                min={50} max={85} step={1}
                onValueChange={([v]) => setFormData(prev => ({ ...prev, taxaAbandono: v / 100 }))}
              />
              <p className="text-xs text-muted-foreground">Média do setor: 70–75%. Quanto maior, mais você perde.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="h-14 px-6 font-black rounded-2xl"
              onClick={() => setSubStep(1)}
            >
              ← Voltar
            </Button>
            <Button
              className="flex-1 h-14 text-lg font-black rounded-2xl gap-2"
              onClick={() => setStep(2)}
            >
              Analisar minha loja <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="max-w-xl mx-auto py-20 text-center space-y-12 animate-in fade-in duration-500">
      <div className="relative inline-flex items-center justify-center" aria-hidden>
        <div className="w-24 h-24 border-4 border-primary/20 rounded-full animate-spin border-t-primary" />
        <Search className="w-10 h-10 text-primary absolute" />
      </div>
      
      <div className="space-y-4">
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
        >
          Calculando estimativas…
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Com base nos números que você informou, calculamos perdas e recuperação possível <strong>no seu navegador</strong> — nenhum dado é enviado a um servidor nesta etapa.
        </p>
        <div className="space-y-3 text-left max-w-sm mx-auto" role="status" aria-live="polite" aria-label="Progresso do cálculo local">
          {LOADING_STEP_ITEMS.map((item, i) => {
            const RowIcon = item.Icon;
            const done = i < loadingStep;
            const active = i === loadingStep;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 text-sm transition-all duration-300",
                  done ? "text-primary font-medium" :
                  active ? "text-foreground opacity-100" : "text-muted-foreground opacity-40"
                )}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                ) : active ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <RowIcon className="w-4 h-4 shrink-0 opacity-50" aria-hidden />
                )}
                <span>{item.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-4">
        <h1
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-3xl md:text-5xl font-black font-syne tracking-tighter uppercase italic outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
        >
          Diagnóstico Concluído
        </h1>
        <p className="text-muted-foreground text-lg">Descubra quanto sua loja está perdendo e quanto podemos recuperar</p>
      </div>

      <p className="text-xs text-muted-foreground border border-border/60 rounded-xl p-4 bg-muted/20 leading-relaxed max-w-3xl mx-auto">
        Os valores abaixo são <strong>projeções e simulações</strong>, não medições auditadas da sua operação. Não constituem garantia de resultado nem aconselhamento jurídico ou fiscal. Resultados reais dependem da sua execução, do mercado e de fatores fora do nosso controle.
      </p>

      <div className="grid md:grid-cols-2 gap-8">
        {/* O que está perdendo */}
        <Card className="border-red-500/20 bg-red-500/5 overflow-hidden relative group transition-all hover:scale-[1.01]">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <AlertCircle className="w-16 h-16 text-red-500" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-red-500 font-bold uppercase tracking-widest text-xs">
              ⚠️ O que sua loja está perdendo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <div className="text-4xl md:text-5xl font-black font-jetbrains text-red-500 tracking-tighter">
                {formatCurrency(diagnostico.receitaPerdida)}
                <span className="text-lg opacity-50 ml-2">/ mês</span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                em carrinhos abandonados, boletos e PIX não pagos por mês
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-red-500/10">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Pedidos/mês</p>
                <p className="text-lg font-black">{formatNumber(diagnostico.pedidosMes)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Abandono</p>
                <p className="text-lg font-black">{Math.round(formData.taxaAbandono * 100)}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Perda/Venda</p>
                <p className="text-lg font-black text-red-500">{formatCurrency(formData.ticketMedio)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* O que podemos recuperar */}
        <Card className="border-emerald-500/20 bg-emerald-500/5 overflow-hidden relative group transition-all hover:scale-[1.01]">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <TrendingUp className="w-16 h-16 text-emerald-500" />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-500 font-bold uppercase tracking-widest text-xs">
              💰 O que podemos recuperar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <div className="text-4xl md:text-5xl font-black font-jetbrains text-emerald-500 tracking-tighter">
                {formatCurrency(diagnostico.receitaRecuperadaTotal)}
                <span className="text-lg opacity-50 ml-2">/ mês</span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                estimativa conservadora baseada no seu segmento
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase">
                <span>Recuperado vs Perdido</span>
                <span className="text-emerald-500">+{recoveryPercentLabel(diagnostico.receitaPerdida, diagnostico.receitaRecuperadaTotal)}%</span>
              </div>
              <Progress
                value={recoveryProgressPercent(diagnostico.receitaPerdida, diagnostico.receitaRecuperadaTotal)}
                className="h-2 bg-emerald-500/20"
                aria-label="Proporção estimada de recuperação em relação à perda mensal"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-500/10">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Via WhatsApp</p>
                <p className="text-sm font-black text-emerald-500">{formatCurrency(diagnostico.receitaRecuperadaWA)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Via E-mail</p>
                <p className="text-sm font-black text-blue-500">{formatCurrency(diagnostico.receitaRecuperadaEmail)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-2xl mx-auto border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 uppercase tracking-tighter font-syne">
            <BarChart3 className="w-5 h-5 text-primary" /> Volume estimado de mensagens/mês
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-6">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">WhatsApp</p>
            <p className="text-xl font-black">{formatNumber(diagnostico.msgWAmes)} msgs</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">E-mail</p>
            <p className="text-xl font-black">{formatNumber(diagnostico.msgEmailMes)} emails</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">CRM</p>
            <p className="text-xl font-black">{formatNumber(formData.clientes)} contatos</p>
          </div>
        </CardContent>
        <CardFooter className="pt-0 border-t border-primary/10 bg-primary/[0.02]">
          <p className="text-[10px] text-muted-foreground font-medium pt-3 italic">
            Projeção conservadora baseada em benchmarks reais do segmento no mercado brasileiro.
          </p>
        </CardFooter>
      </Card>

      <div className="text-center">
        <Button 
          size="lg" 
          className="h-16 px-12 text-xl font-black rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all gap-2"
          onClick={() => setStep(4)}
        >
          Ver meu plano recomendado <ArrowRight className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );

  const renderStep4 = () => {
    const suggestedKey = diagnostico.planoSugerido;
    
    return (
      <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
          <Badge variant="outline" className="border-primary/30 text-primary uppercase tracking-widest text-[10px] font-bold px-4 py-1">
            Recomendação Final
          </Badge>
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-3xl md:text-5xl font-black font-syne tracking-tighter uppercase italic outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
          >
            Plano {PLANS[suggestedKey].name}
          </h2>
          <p className="text-muted-foreground text-lg">
            Com base no seu perfil, este é o plano que faz mais sentido para você
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key) => {
            const plan = PLANS[key];
            const isSuggested = key === suggestedKey;
            
            // Calculate simulation
            const contactPacks = simContacts;
            const extraWABundles = simWA;
            const extraEmailBundles = simEmail;
            
            // Logic to select bundles based on simWA, simEmail
            const selectedBundles: string[] = [];
            for (let i = 0; i < extraWABundles; i++) selectedBundles.push(BUNDLES.wa[0].id);
            for (let i = 0; i < extraEmailBundles; i++) selectedBundles.push(BUNDLES.email[0].id);

            const result = calcPlano(key, { 
              recovered: simRecuperada, 
              contactPacks, 
              bundles: selectedBundles 
            });

            const roi = result.revTotal > 0 ? simRecuperada / result.revTotal : 0;

            return (
              <Card 
                key={key} 
                className={cn(
                  "relative flex flex-col h-full transition-all duration-300",
                  isSuggested ? "border-primary ring-2 ring-primary scale-[1.05] z-10 shadow-2xl" : "border-border opacity-60 grayscale hover:opacity-100 hover:grayscale-0"
                )}
              >
                {isSuggested && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                    Recomendado para você
                  </div>
                )}
                
                <CardHeader className={cn("p-6", plan.color === 'emerald' ? "bg-emerald-500/5" : plan.color === 'indigo' ? "bg-indigo-500/5" : "bg-slate-500/5")}>
                  <div className="flex justify-between items-center mb-2">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <span>{plan.emoji}</span> {plan.name}
                    </CardTitle>
                    <span className="text-2xl font-black">{formatCurrency(plan.base)}</span>
                  </div>
                  <CardDescription className="text-xs font-medium uppercase tracking-widest">{plan.audience}</CardDescription>
                </CardHeader>

                <CardContent className="p-6 space-y-6 flex-1">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-primary" /> ① Base Fixa
                      </p>
                      <div className="pl-4.5 space-y-1">
                        <p className="text-xs font-medium">Inclui: {formatNumber(plan.maxContacts)} contatos</p>
                        <p className="text-xs font-medium">Canais: {plan.includedWA} msgs WA / {formatNumber(plan.includedEmail)} emails</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-primary" /> ② Success Fee: {Math.round(plan.successFeeRate * 100)}%
                      </p>
                      <div className="pl-4.5">
                        <p className="text-xs font-medium">Sobre receita recuperada</p>
                        <p className="text-xs font-bold text-emerald-500">Estimativa: {formatCurrency(result.revSuccess)}</p>
                      </div>
                    </div>

                    {(extraWABundles > 0 || extraEmailBundles > 0 || contactPacks > 0) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-primary" /> ③ Pacotes extras
                        </p>
                        <div className="pl-4.5 space-y-1">
                          {extraWABundles > 0 && <p className="text-xs font-medium">{extraWABundles}x WA +250: {formatCurrency(extraWABundles * BUNDLES.wa[0].price)}</p>}
                          {extraEmailBundles > 0 && <p className="text-xs font-medium">{extraEmailBundles}x Email +10k: {formatCurrency(extraEmailBundles * BUNDLES.email[0].price)}</p>}
                          {contactPacks > 0 && <p className="text-xs font-medium">{contactPacks}x 1k Contatos: {formatCurrency(contactPacks * CONTACT_PACK.price)}</p>}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-dashed space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Base Fixa</span>
                      <span>{formatCurrency(result.revBase)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Success Fee</span>
                      <span className="text-emerald-500">+{formatCurrency(result.revSuccess)}</span>
                    </div>
                    {(result.revBundles > 0 || result.revContacts > 0) && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Pacotes</span>
                        <span>+{formatCurrency(result.revBundles + result.revContacts)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-end pt-2">
                      <span className="font-bold text-sm">Investimento Total</span>
                      <span className="text-xl font-black text-primary">{formatCurrency(result.revTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI Projetado</span>
                      <Badge className="bg-emerald-500 text-black font-black">{roi.toFixed(1)}x</Badge>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="p-6 pt-0 flex flex-col gap-3">
                  {!isSuggested && (
                    <p className="text-[10px] text-amber-600 font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 w-full text-center leading-relaxed">
                      Plano abaixo do recomendado — você vai capturar apenas uma parte das oportunidades identificadas no diagnóstico.
                    </p>
                  )}
                  <Button
                    className={cn("w-full font-black uppercase tracking-widest rounded-xl py-6", isSuggested ? "" : "variant-outline")}
                    disabled={savingPlan !== null}
                    onClick={() => handleSelectPlan(key, isSuggested)}
                  >
                    {savingPlan === key
                      ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      : null}
                    Começar com {plan.name} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Ajuste de simulação */}
        <Card className="border-border bg-muted/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 uppercase tracking-tighter font-syne">
              <BarChart3 className="w-5 h-5 text-primary" /> 🧮 Ajuste a simulação
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Receita Recuperada</Label>
                <span className="text-sm font-black text-emerald-500">{formatCurrency(simRecuperada)}</span>
              </div>
              <Slider 
                value={[simRecuperada]} 
                min={0} 
                max={Math.max(1000, diagnostico.receitaPerdida || 0)} 
                step={1000}
                onValueChange={([v]) => setSimRecuperada(v)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Pacotes WA Extras</Label>
                <span className="text-sm font-black text-primary">{simWA} pacotes</span>
              </div>
              <Slider 
                value={[simWA]} 
                min={0} 
                max={10} 
                step={1}
                onValueChange={([v]) => setSimWA(v)}
              />
              <p className="text-[9px] text-muted-foreground">+250 msgs / pacote</p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Pacotes Email Extras</Label>
                <span className="text-sm font-black text-primary">{simEmail} pacotes</span>
              </div>
              <Slider 
                value={[simEmail]} 
                min={0} 
                max={10} 
                step={1}
                onValueChange={([v]) => setSimEmail(v)}
              />
              <p className="text-[9px] text-muted-foreground">+10k emails / pacote</p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Base de Contatos (+1k)</Label>
                <span className="text-sm font-black text-primary">+{simContacts * 1000}</span>
              </div>
              <Slider 
                value={[simContacts]} 
                min={0} 
                max={20} 
                step={1}
                onValueChange={([v]) => setSimContacts(v)}
              />
              <p className="text-[9px] text-muted-foreground">R$ 39 / 1.000 contatos</p>
            </div>
          </CardContent>
          <CardFooter className="justify-center border-t border-border pt-6 pb-6 bg-muted/30">
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <Button
                size="lg"
                className="flex-1 font-black rounded-xl h-12"
                disabled={savingPlan !== null}
                onClick={() => handleSelectPlan(diagnostico.planoSugerido, true)}
              >
                {savingPlan === diagnostico.planoSugerido
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : null}
                Ativar minha loja agora
              </Button>
              <Button size="lg" variant="outline" className="flex-1 font-black rounded-xl h-12" asChild>
                <a href="/contato?assunto=demo">Falar com um consultor</a>
              </Button>
            </div>
          </CardFooter>
        </Card>

        <div className="text-center max-w-2xl mx-auto space-y-4">
          <p className="text-xs text-muted-foreground border border-border/60 rounded-xl p-4 bg-muted/20 leading-relaxed text-left">
            Reforço: as simulações desta página são <strong>estimativas ilustrativas</strong>. Não substituem análise contábil, jurídica ou de due diligence. A contratação de planos e o uso da plataforma ficam sujeitos aos <a href="/termos" className="underline font-medium hover:text-foreground">Termos</a> e à <a href="/privacidade" className="underline font-medium hover:text-foreground">Política de Privacidade</a>.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Projeções baseadas em benchmarks reais do mercado brasileiro. Usamos estimativa conservadora para não criar expectativas acima do que entregamos. Comece a recuperar vendas hoje — sem contrato de fidelidade.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col bg-background", embedInDashboard ? "min-h-0" : "min-h-screen")}>
      {!embedInDashboard && <Header />}

      <main className={cn("flex-1 px-4", embedInDashboard ? "py-6 md:py-8" : "py-12 md:py-20")}>
        <div className="container max-w-6xl mx-auto">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </main>

      {!embedInDashboard && <Footer />}
    </div>
  );
}
