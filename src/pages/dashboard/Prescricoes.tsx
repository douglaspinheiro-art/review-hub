import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Filter, Settings, Zap, RefreshCw, ChevronRight, Lock, TrendingUp, ArrowRight, X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PrescriptionCard } from "@/components/dashboard/PrescriptionCard";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Confetti } from "@/components/dashboard/Confetti";
import { useLoja } from "@/hooks/useConvertIQ";
import { usePrescriptionsV3, useUpdatePrescriptionStatus } from "@/hooks/useLTVBoost";
import {
  mockPrescricaoToRow,
  isPrescriptionInExecution,
  prescriptionRowToCardProps,
  prescriptionToCampaignPrefill,
  type PrescriptionRow,
} from "@/lib/prescription-map";
import { mockPrescricoes } from "@/lib/mock-data";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const UPSELL_POTENTIAL_CAP = 25_000;
const PRESCRICOES_ONBOARDING_KEY = "ltv_prescricoes_visto";

function readPrescricoesOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(PRESCRICOES_ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

type ChannelFilter = "all" | "whatsapp" | "email" | "sms";

export default function Prescricoes() {
  const location = useLocation();
  const isDemo = location.pathname.startsWith("/demo");
  const [onboardingBannerDismissed, setOnboardingBannerDismissed] = useState(true);
  useEffect(() => {
    setOnboardingBannerDismissed(readPrescricoesOnboardingDismissed());
  }, []);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showUpsellBanner, setShowUpsellBanner] = useState(true);
  const [showTrialGate, setShowTrialGate] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const { profile, isTrialActive } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loja = useLoja();
  const storeId = loja.data?.id as string | undefined;

  const { data: rxRows = [], isLoading, isError, error, refetch } = usePrescriptionsV3(isDemo ? undefined : storeId);
  const updateStatus = useUpdatePrescriptionStatus(storeId);

  const rows: PrescriptionRow[] = useMemo(() => {
    if (isDemo) return mockPrescricoes.map(mockPrescricaoToRow);
    return (rxRows ?? []) as PrescriptionRow[];
  }, [isDemo, rxRows]);

  const filtered = useMemo(() => {
    if (channelFilter === "all") return rows;
    return rows.filter((r) => (r.execution_channel ?? "whatsapp").toLowerCase() === channelFilter);
  }, [rows, channelFilter]);

  const aguardando = useMemo(
    () => filtered.filter((r) => (r.status ?? "") === "aguardando_aprovacao"),
    [filtered],
  );
  const execucao = useMemo(
    () => filtered.filter((r) => isPrescriptionInExecution(r.status)),
    [filtered],
  );
  const concluidas = useMemo(
    () => filtered.filter((r) => (r.status ?? "") === "concluida"),
    [filtered],
  );

  const pendingPotentialSum = useMemo(
    () =>
      aguardando.reduce((a, r) => a + Number(r.estimated_potential ?? 0), 0),
    [aguardando],
  );
  const upsellDisplay = Math.min(
    Math.round(pendingPotentialSum > 0 ? pendingPotentialSum * 0.12 : 0),
    UPSELL_POTENTIAL_CAP,
  );

  const isStarter = profile?.plan === "starter";
  const isNotScale = profile?.plan !== "scale" && profile?.plan !== "enterprise";

  const handleAprovar = async (row: PrescriptionRow) => {
    if (isTrialActive) {
      setShowTrialGate(true);
      return;
    }

    if (isDemo) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
      toast.info("Modo demonstração: rascunho de campanha não persistido.");
      navigate("/dashboard/campanhas?new=true");
      return;
    }

    const prefill = prescriptionToCampaignPrefill(row);

    try {
      const { data: campaignId, error: rpcError } = await supabase.rpc("approve_prescription_campaign_draft", {
        p_prescription_id: row.id,
        p_campaign_name: prefill.name || "Campanha da Prescrição",
        p_message: prefill.message || "",
        p_channel: prefill.channel || "whatsapp",
        p_email_rfm: prefill.rfmSegment || "",
        p_email_mode: prefill.segment || "",
      });

      if (rpcError) throw rpcError;
      if (!campaignId || typeof campaignId !== "string") {
        throw new Error("Resposta inválida ao criar campanha.");
      }

      await queryClient.invalidateQueries({ queryKey: ["prescriptions_v3", storeId] });

      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);

      navigate(`/dashboard/campanhas?edit=${campaignId}`);
    } catch (e: unknown) {
      console.error("Erro ao aprovar prescrição:", e);
      toast.error(
        "Não foi possível persistir a campanha: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  const handleRejeitar = async (row: PrescriptionRow) => {
    if (isDemo) {
      toast.info("Modo demonstração: rejeição não é salva.");
      return;
    }
    try {
      await updateStatus.mutateAsync({ id: row.id, status: "rejeitada" });
      toast.success("Prescrição rejeitada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao rejeitar");
    }
  };

  const onRefresh = () => {
    if (isDemo) {
      toast.info("Modo demonstração.");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["prescriptions_v3", storeId] });
    void refetch();
    toast.success("Lista atualizada.");
  };

  return (
    <TooltipProvider>
      <div className="space-y-8 pb-24 md:pb-10 relative">
        <Confetti trigger={showConfetti} />

        <Dialog open={showTrialGate} onOpenChange={setShowTrialGate}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <DialogTitle className="text-center font-black text-xl">Ative seu plano para continuar</DialogTitle>
              <DialogDescription className="text-center">
                Seu acesso de demonstração permite <strong>visualizar</strong> todas as funcionalidades,
                mas para aprovar prescrições você precisa de um plano ativo.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 mt-2">
              <Button className="font-black rounded-xl" onClick={() => { setShowTrialGate(false); navigate("/upgrade"); }}>
                Ver planos e ativar agora
              </Button>
              <Button variant="ghost" onClick={() => setShowTrialGate(false)} className="text-muted-foreground">
                Continuar explorando
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-50 flex gap-3 animate-in slide-in-from-bottom-full duration-500">
          <Button variant="outline" className="flex-1 h-12 font-bold rounded-xl" onClick={() => navigate("/dashboard")}>
            Voltar
          </Button>
        </div>

        {!onboardingBannerDismissed && (
          <div className="bg-card border border-primary/20 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 items-start animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-1.5">
              <p className="font-black text-sm">O que são Prescrições?</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A IA analisa o comportamento da sua loja e gera <strong className="text-foreground">ações pontuais e priorizadas</strong>.
                Ao aprovar, você abre o fluxo de campanha com segmento e mensagem sugeridos. Gere um diagnóstico no Funil para criar prescrições na sua loja.
              </p>
              <p className="text-xs text-muted-foreground">
                Dica: prescrições ligadas a problemas críticos no funil devem ser tratadas primeiro.
              </p>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => {
                try {
                  localStorage.setItem(PRESCRICOES_ONBOARDING_KEY, "1");
                } catch {
                  /* ignore */
                }
                setOnboardingBannerDismissed(true);
              }}
              id="prescricoes-banner-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Central de Prescrições</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Ações sugeridas pela IA a partir do diagnóstico. Aprove para criar uma campanha em rascunho.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button type="button" variant="outline" className="font-bold gap-2 rounded-xl" disabled>
                  <Settings className="w-4 h-4" /> Aprovação automática
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Em breve: preferências por loja na API.</TooltipContent>
          </Tooltip>
        </div>

        {isNotScale && showUpsellBanner && (
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground leading-tight">
                  {upsellDisplay > 0 ? (
                    <>
                      No plano Escala, estimativa adicional de até{" "}
                      <span className="text-primary">R$ {upsellDisplay.toLocaleString("pt-BR")}</span>{" "}
                      com prescrições avançadas e automações (valor indicativo com base nas suas prescrições pendentes).
                    </>
                  ) : (
                    <>No plano Escala, desbloqueie prescrições avançadas, A/B automático e prioridade de fila.</>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                  Aprovação automática e fila prioritária entre os benefícios do plano superior.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" className="h-8 font-black text-[10px] uppercase tracking-widest gap-1.5 rounded-xl" onClick={() => navigate("/planos")}>
                Ver Escala <ArrowRight className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowUpsellBanner(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {!isDemo && !storeId && !isLoading && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Configure sua loja para ver prescrições geradas pelo diagnóstico.
            <Button variant="link" className="block mx-auto mt-2" onClick={() => navigate("/dashboard/funil")}>
              Ir para Funil / ConvertIQ
            </Button>
          </div>
        )}

        {isError && !isDemo && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-sm font-medium text-destructive">{error instanceof Error ? error.message : "Erro ao carregar prescrições"}</p>
            <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Não foi possível carregar as prescrições. Tente novamente; se continuar, contacte o suporte com o horário do erro.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        <Tabs defaultValue="aguardando" className="w-full">
          <div className="flex items-center justify-between mb-6 overflow-x-auto gap-4 pb-2">
            <TabsList className="bg-muted/50 p-1 rounded-xl shrink-0">
              <TabsTrigger value="aguardando" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                Aguardando{" "}
                <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-0">
                  {isLoading && !isDemo ? "…" : aguardando.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="execucao" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                Em execução{" "}
                <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground border-0">
                  {isLoading && !isDemo ? "…" : execucao.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="concluidas" className="rounded-lg px-6 font-bold text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                Concluídas{" "}
                <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground border-0">
                  {isLoading && !isDemo ? "…" : concluidas.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs font-bold gap-1 text-muted-foreground">
                    <Filter className="w-3.5 h-3.5" /> Canal
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
                    <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="whatsapp">WhatsApp</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="email">E-mail</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="sms">SMS</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" className="text-xs font-bold gap-1 text-muted-foreground" onClick={onRefresh}>
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar
              </Button>
            </div>
          </div>

          <TabsContent value="aguardando" className="mt-0">
            {isLoading && !isDemo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-80 rounded-2xl" />
                ))}
              </div>
            ) : aguardando.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-2xl">
                <Sparkles className="w-10 h-10 text-muted-foreground mb-3" />
                <h3 className="font-black text-lg">Nenhuma prescrição aguardando</h3>
                <p className="text-sm text-muted-foreground max-w-md mt-2">
                  Gere um diagnóstico no Funil para a IA criar oportunidades e prescrições para sua loja.
                </p>
                <Button className="mt-6 font-black rounded-xl" onClick={() => navigate("/dashboard/funil")}>
                  Abrir Funil / Diagnóstico
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {aguardando.map((row) => {
                  const cardBase = prescriptionRowToCardProps(row);
                  const isLocked = isStarter && cardBase.ab_teste_ativo;
                  return (
                    <div key={row.id} className="relative group">
                      <div className={isLocked ? "opacity-40 grayscale pointer-events-none" : ""}>
                        <PrescriptionCard
                          {...cardBase}
                          onAprovar={() => handleAprovar(row)}
                          onRejeitar={() => void handleRejeitar(row)}
                        />
                      </div>
                      {isLocked && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-background/20 backdrop-blur-[2px] rounded-2xl border border-dashed border-border group-hover:bg-background/40 transition-all">
                          <div className="w-10 h-10 rounded-full bg-card border shadow-sm flex items-center justify-center mb-3">
                            <Lock className="w-4 h-4 text-primary" />
                          </div>
                          <h4 className="font-bold text-xs uppercase tracking-tighter mb-1">A/B Teste Recomendado</h4>
                          <p className="text-[10px] text-muted-foreground mb-4">Disponível no plano Growth</p>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 font-bold text-[10px] uppercase tracking-widest px-4 rounded-lg bg-primary text-primary-foreground"
                            onClick={() => navigate("/planos")}
                          >
                            Fazer Upgrade
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {isDemo && (
                  <div className="bg-card/50 border border-dashed border-border/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center relative group overflow-hidden">
                    <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-6">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Zap className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <h4 className="font-bold text-sm mb-1 uppercase tracking-tighter">Demonstração</h4>
                      <p className="text-xs text-muted-foreground mb-4">No app autenticado, os cartões vêm do banco.</p>
                    </div>
                    <div className="w-full space-y-4 opacity-20 grayscale">
                      <div className="h-4 bg-muted rounded w-1/2" />
                      <div className="h-20 bg-muted rounded" />
                      <div className="h-8 bg-muted rounded" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="execucao" className="mt-0">
            {execucao.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Zap className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold">Nenhuma prescrição em execução</h3>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
                  Após aprovar, a prescrição fica como aprovada até a campanha ser disparada. Campanhas em andamento aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {execucao.map((row) => (
                  <PrescriptionCard
                    key={row.id}
                    {...prescriptionRowToCardProps(row)}
                    onAprovar={undefined}
                    onRejeitar={undefined}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="concluidas" className="mt-0">
            {concluidas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground text-sm">
                Nenhuma prescrição concluída ainda.
              </div>
            ) : (
              <div className="bg-card border rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/50">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prescrição</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Canal</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Potencial est.</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI est.</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {concluidas.map((row) => (
                      <tr key={row.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-sm">{row.title}</div>
                          <div className="text-[10px] text-muted-foreground uppercase font-bold">
                            {(row.execution_channel ?? "—").toString()} · {row.segment_target ?? "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold uppercase">{(row.execution_channel ?? "—").toString()}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                          R$ {Number(row.estimated_potential ?? 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold">{Number(row.estimated_roi ?? 0)}x</td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={() => navigate("/dashboard/campanhas")}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
