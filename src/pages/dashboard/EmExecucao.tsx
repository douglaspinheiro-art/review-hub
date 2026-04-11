import { useMemo } from "react";
import {
  Zap,
  MessageCircle,
  Mail,
  Smartphone,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Trophy,
  ExternalLink,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoja } from "@/hooks/useConvertIQ";
import { usePrescriptionsV3 } from "@/hooks/useLTVBoost";
import { useCampaigns } from "@/hooks/useDashboard";
import {
  mockPrescricaoToRow,
  isPrescriptionInExecution,
  type PrescriptionRow,
} from "@/lib/prescription-map";
import { mockPrescricoes, mockLinkedCampaignsForExec } from "@/lib/mock-data";
import { toast } from "sonner";

type CampaignRow = {
  id: string;
  name?: string;
  status?: string;
  channel?: string;
  /** Preferir quando existir (agregado `message_sends` + linha da campanha). */
  aggregated_sent_count?: number;
  sent_count?: number;
  delivered_count?: number;
  read_count?: number;
  reply_count?: number;
  total_contacts?: number;
  source_prescription_id?: string | null;
  ab_test_id?: string | null;
  winner_variant?: string | null;
  incremental_lift_pct?: number;
  attributed_revenue?: number;
  incremental_revenue?: number;
  holdout_rate?: number;
};

const STATUS_PT: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
  failed: "Falhou",
};

function campaignDispatchPriority(status: string | undefined): number {
  const s = status ?? "";
  if (s === "running") return 0;
  if (s === "scheduled") return 1;
  if (s === "draft") return 2;
  return 3;
}

function pickLinkedCampaign(
  prescriptionId: string,
  campaigns: CampaignRow[],
): CampaignRow | null {
  const linked = campaigns.filter((c) => c.source_prescription_id === prescriptionId);
  if (linked.length === 0) return null;
  return [...linked].sort((a, b) => {
    const pa = campaignDispatchPriority(a.status);
    const pb = campaignDispatchPriority(b.status);
    if (pa !== pb) return pa - pb;
    return String(b.id).localeCompare(String(a.id));
  })[0];
}

function channelIcon(c: string | undefined) {
  const x = (c ?? "whatsapp").toLowerCase();
  if (x === "email") return Mail;
  if (x === "sms") return Smartphone;
  return MessageCircle;
}

function channelLabel(c: string | undefined) {
  const x = (c ?? "whatsapp").toLowerCase();
  if (x === "email") return "E-mail";
  if (x === "sms") return "SMS";
  if (x === "multicanal") return "Multicanal";
  return "WhatsApp";
}

export default function EmExecucao() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDemo = location.pathname.startsWith("/demo");
  const loja = useLoja();
  const storeId = loja.data?.id as string | undefined;

  const {
    data: rxRows = [],
    isLoading: rxLoading,
    isError: rxError,
    error: rxErr,
    refetch: refetchRx,
  } = usePrescriptionsV3(isDemo ? undefined : storeId);

  const {
    data: campaignsRaw = [],
    isLoading: campLoading,
    isError: campError,
    error: campErr,
    refetch: refetchCamp,
  } = useCampaigns({ limit: 500 });

  const rows: PrescriptionRow[] = useMemo(() => {
    if (isDemo) return mockPrescricoes.map(mockPrescricaoToRow);
    return (rxRows ?? []) as PrescriptionRow[];
  }, [isDemo, rxRows]);

  const inProgress = useMemo(
    () => rows.filter((r) => isPrescriptionInExecution(r.status)),
    [rows],
  );

  const campaigns: CampaignRow[] = useMemo(() => {
    if (isDemo) return mockLinkedCampaignsForExec as CampaignRow[];
    return (campaignsRaw ?? []) as CampaignRow[];
  }, [isDemo, campaignsRaw]);

  const cards = useMemo(
    () =>
      inProgress.map((rx) => ({
        rx,
        campaign: pickLinkedCampaign(rx.id, campaigns),
      })),
    [inProgress, campaigns],
  );

  const isLoading = !isDemo && (rxLoading || campLoading);
  const isError = !isDemo && (rxError || campError);
  const errorMsg =
    rxErr instanceof Error
      ? rxErr.message
      : campErr instanceof Error
        ? campErr.message
        : "Erro ao carregar dados";

  const baseDash = isDemo ? "/demo" : "/dashboard";

  const onRefresh = () => {
    if (isDemo) {
      toast.info("Modo demonstração: dados locais.");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["prescriptions_v3", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    void refetchRx();
    void refetchCamp();
    toast.success("Métricas atualizadas.");
  };

  return (
      <div className="space-y-8 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">
              Em execução
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Veja prescrições em curso e a campanha associada a cada uma. Use «Atualizar métricas» para refletir os
              últimos envios e estados.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 font-bold gap-2 rounded-xl"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar métricas
          </Button>
        </div>

        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <AlertCircle className="w-8 h-8 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-sm">Não foi possível carregar</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 font-bold" onClick={onRefresh}>
              Tentar de novo
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        )}

        {!isLoading && !isError && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed bg-muted/20">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold">Nenhuma prescrição em execução</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mt-2">
              Após aprovar, a prescrição fica como aprovada até a campanha ser disparada. Campanhas
              em andamento aparecem aqui com métricas da lista de campanhas.
            </p>
            <Button
              className="mt-6 font-bold rounded-xl"
              onClick={() => navigate(`${baseDash}/prescricoes`)}
            >
              Ir para prescrições
            </Button>
          </div>
        )}

        {!isLoading && !isError && cards.length > 0 && (
          <div className="space-y-6">
            {cards.map(({ rx, campaign: c }) => {
              const CanalIcon = channelIcon(rx.execution_channel ?? c?.channel);
              const sent = Math.max(
                0,
                Number(c?.aggregated_sent_count ?? c?.sent_count ?? 0),
              );
              const total = Math.max(0, Number(c?.total_contacts ?? 0));
              const progressPct =
                total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : sent > 0 ? 100 : 0;
              const readPct = sent > 0 ? Math.round(((c?.read_count ?? 0) / sent) * 100) : 0;
              const delPct = sent > 0 ? Math.round(((c?.delivered_count ?? 0) / sent) * 100) : 0;
              const replies = Math.max(0, Number(c?.reply_count ?? 0));
              const revenue = Number(c?.incremental_revenue ?? c?.attributed_revenue ?? 0);
              const st = (c?.status ?? "") as string;
              const hasAb = Boolean(c?.ab_test_id);

              return (
                <div key={rx.id} className="bg-card border rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-border/50 bg-muted/10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                          <Zap className="w-6 h-6 fill-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-none mb-1">{rx.title}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] font-bold uppercase">
                              {(rx.status ?? "").replace(/_/g, " ")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                              <CanalIcon className="w-3 h-3" />
                              {channelLabel(rx.execution_channel ?? c?.channel)}
                            </span>
                            {c && (
                              <Badge variant="outline" className="text-[10px] font-bold uppercase">
                                {STATUS_PT[st] ?? st}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-lg font-bold gap-2"
                          type="button"
                          onClick={() => {
                            if (c?.id) {
                              navigate(`${baseDash}/campanhas#campaign-row-${c.id}`);
                            } else {
                              navigate(`${baseDash}/campanhas`);
                            }
                          }}
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> Relatório na lista
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Progresso do envio
                          </span>
                          <span className="text-xs font-black font-syne text-primary">{progressPct}%</span>
                        </div>
                        <Progress value={progressPct} className="h-2" />
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {c
                            ? `${sent.toLocaleString("pt-BR")} enviados${total > 0 ? ` de ${total.toLocaleString("pt-BR")} contatos` : ""}.`
                            : "Nenhuma campanha vinculada a esta prescrição ainda. Crie ou dispare a campanha em Campanhas."}
                        </p>
                        {c ? (
                          <p className="text-[10px] text-muted-foreground/80 mt-1 italic">
                            A percentagem é aproximada quando há envios parciais, vários canais ou métricas ainda a
                            consolidar.
                          </p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-muted/30 rounded-xl">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">
                            Enviados
                          </span>
                          <div className="text-lg font-black font-syne">{sent.toLocaleString("pt-BR")}</div>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-xl">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">
                            Entregues
                          </span>
                          <div className="text-lg font-black font-syne">{delPct}%</div>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-xl">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">
                            Abertos
                          </span>
                          <div className="text-lg font-black font-syne">{readPct}%</div>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-xl">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">
                            Respostas
                          </span>
                          <div className="text-lg font-black font-syne text-emerald-600">
                            {replies.toLocaleString("pt-BR")}
                          </div>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-xl col-span-2">
                          <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">
                            Receita atribuída (estimada)
                          </span>
                          <div className="text-lg font-black font-syne text-emerald-600">
                            R${" "}
                            {Math.round(revenue).toLocaleString("pt-BR", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                      {hasAb && c && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-sm flex items-center gap-2">
                              <FlaskConical className="w-4 h-4 text-indigo-500" /> Teste A/B da campanha
                            </h4>
                            {c.winner_variant && (
                              <Badge className="bg-indigo-500/10 text-indigo-500 border-0 text-[10px] font-black gap-1">
                                <Trophy className="w-3 h-3" />
                                Vencedor: {String(c.winner_variant).toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-2">
                            <li>
                              Lift incremental estimado:{" "}
                              <span className="font-syne font-bold text-foreground">
                                {Number(c.incremental_lift_pct ?? 0)}%
                              </span>
                            </li>
                            <li>
                              Holdout:{" "}
                              <span className="font-syne font-bold text-foreground">
                                {Math.round(Number(c.holdout_rate ?? 0) * 100)}%
                              </span>
                            </li>
                            <li>
                              Receita atribuída (bruta): R${" "}
                              {Math.round(Number(c.attributed_revenue ?? 0)).toLocaleString("pt-BR")}
                            </li>
                          </ul>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-4 font-bold gap-2"
                            type="button"
                            onClick={() => navigate(`${baseDash}/campanhas#campaign-row-${c.id}`)}
                          >
                            Ver campanha na lista
                          </Button>
                        </div>
                      )}

                      {!hasAb && c && (
                        <div className="rounded-2xl border bg-muted/20 p-5 text-sm text-muted-foreground">
                          Dica: métricas vêm da campanha vinculada. Campanhas com teste A/B exibem
                          resumo de lift e vencedor aqui.
                        </div>
                      )}

                      {!c && (
                        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                          Ainda não há campanha com esta prescrição como origem. Abra{" "}
                          <button
                            type="button"
                            className="text-primary font-bold underline"
                            onClick={() => navigate(`${baseDash}/campanhas`)}
                          >
                            Campanhas
                          </button>{" "}
                          para criar a partir da Central de prescrições.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-muted/30 border border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground opacity-30 mb-2" />
              <p className="text-xs text-muted-foreground max-w-md">
                Outras prescrições em análise ou pendentes ficam em{" "}
                <button
                  type="button"
                  className="text-primary font-bold underline"
                  onClick={() => navigate(`${baseDash}/prescricoes`)}
                >
                  Prescrições
                </button>
                .
              </p>
            </div>
          </div>
        )}
      </div>
  );
}
