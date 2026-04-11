import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Zap,
  Plus,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Link2,
} from "lucide-react";
import { Link } from "react-router-dom";
import AutomacaoModal from "@/components/dashboard/AutomacaoModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { TrialGate } from "@/components/dashboard/TrialGate";
import { JORNADAS_META, CATALOG_TIPO_JORNADAS } from "@/lib/automations-meta";
import { DEFAULT_JOURNEYS_FOR_STORE, CORE_FLOW_TIPOS } from "@/lib/journey-defaults";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Database } from "@/integrations/supabase/types";

type JourneyRow = Database["public"]["Tables"]["journeys_config"]["Row"];

type AutomacoesBundle = {
  journeys: JourneyRow[];
  sentByJourneyId: Record<string, number>;
};

const EMPTY_JOURNEYS: JourneyRow[] = [];
const EMPTY_SENT: Record<string, number> = {};

export default function Automacoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [storeListLoading, setStoreListLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const seedAttemptedForStore = useRef<string | null>(null);

  const fetchLojas = useCallback(async () => {
    if (!user?.id) return;
    setStoreListLoading(true);
    const { data, error } = await supabase.from("stores").select("id, name").eq("user_id", user.id).order("name");
    if (error) {
      toast.error("Não foi possível carregar as lojas.");
      setLojas([]);
      setSelectedStoreId("");
    } else if (data?.length) {
      setLojas(data);
      setSelectedStoreId((prev) => (prev && data.some((s) => s.id === prev) ? prev : data[0].id));
    } else {
      setLojas([]);
      setSelectedStoreId("");
    }
    setStoreListLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void fetchLojas();
  }, [fetchLojas]);

  const {
    data,
    isLoading: journeysLoading,
    isError: journeysError,
    error: journeysErrorObj,
    refetch: refetchJourneys,
  } = useQuery({
    queryKey: ["automacoes_journeys", selectedStoreId],
    queryFn: async (): Promise<AutomacoesBundle> => {
      const { data: journeys, error: jErr } = await supabase
        .from("journeys_config")
        .select("*")
        .eq("store_id", selectedStoreId)
        .order("tipo_jornada");
      if (jErr) throw jErr;

      const jList = journeys ?? [];
      const ids = jList.map((j) => j.id).filter(Boolean);
      const sentByJourneyId: Record<string, number> = {};
      if (ids.length) {
        const { data: sentRows, error: sErr } = await supabase
          .from("scheduled_messages")
          .select("journey_id")
          .eq("store_id", selectedStoreId)
          .eq("status", "sent")
          .in("journey_id", ids);
        if (sErr) throw sErr;
        for (const row of sentRows ?? []) {
          const jid = row.journey_id as string | null;
          if (!jid) continue;
          sentByJourneyId[jid] = (sentByJourneyId[jid] ?? 0) + 1;
        }
      }
      return { journeys: jList, sentByJourneyId };
    },
    enabled: !!selectedStoreId,
    retry: 1,
  });

  const journeys = data?.journeys ?? EMPTY_JOURNEYS;
  const sentByJourneyId = data?.sentByJourneyId ?? EMPTY_SENT;

  const { data: whatsappOk = false } = useQuery({
    queryKey: ["automacoes_whatsapp", selectedStoreId],
    queryFn: async () => {
      const { data: row } = await supabase
        .from("whatsapp_connections")
        .select("id")
        .eq("store_id", selectedStoreId)
        .eq("status", "connected")
        .maybeSingle();
      return !!row;
    },
    enabled: !!selectedStoreId,
  });

  const seedJourneysMutation = useMutation({
    mutationFn: async (storeId: string) => {
      const rows = DEFAULT_JOURNEYS_FOR_STORE.map((j) => ({
        ...j,
        store_id: storeId,
        kpi_atual: 0,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("journeys_config").upsert(rows, {
        onConflict: "store_id,tipo_jornada",
      });
      if (error) throw error;
    },
    onSuccess: (_, storeId) => {
      queryClient.invalidateQueries({ queryKey: ["automacoes_journeys", storeId] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Não foi possível criar as jornadas padrão.");
      seedAttemptedForStore.current = null;
    },
  });

  useEffect(() => {
    if (!selectedStoreId || journeysLoading || journeysError) return;
    if (journeys.length > 0) return;
    if (seedJourneysMutation.isPending) return;
    if (seedAttemptedForStore.current === selectedStoreId) return;
    seedAttemptedForStore.current = selectedStoreId;
    seedJourneysMutation.mutate(selectedStoreId);
  }, [selectedStoreId, journeys.length, journeysLoading, journeysError, seedJourneysMutation]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase
        .from("journeys_config")
        .update({ ativa, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("store_id", selectedStoreId);
      if (error) throw error;
    },
    onSuccess: (_, { ativa }) => {
      toast.success(ativa ? "Jornada ativada" : "Jornada pausada");
      queryClient.invalidateQueries({ queryKey: ["automacoes_journeys", selectedStoreId] });
    },
    onError: () => toast.error("Erro ao atualizar jornada"),
  });

  const activateCoreFlowsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStoreId) throw new Error("Selecione uma loja");
      for (const tipo of CORE_FLOW_TIPOS) {
        const { error } = await supabase
          .from("journeys_config")
          .update({ ativa: true, updated_at: new Date().toISOString() })
          .eq("store_id", selectedStoreId)
          .eq("tipo_jornada", tipo);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Fluxos core ativados: carrinho, pós-compra e reativação");
      queryClient.invalidateQueries({ queryKey: ["automacoes_journeys", selectedStoreId] });
    },
    onError: () => toast.error("Não foi possível ativar os fluxos core"),
  });

  const jornadas = useMemo(
    () =>
      JORNADAS_META.map((meta) => {
        const dbRow = journeys.find((a) => a.tipo_jornada === meta.tipo_jornada);
        const sent = dbRow ? sentByJourneyId[dbRow.id] ?? 0 : 0;
        return {
          ...meta,
          dbId: dbRow?.id,
          is_active: dbRow?.ativa ?? meta.defaultActive,
          sent_count: sent,
        };
      }),
    [journeys, sentByJourneyId],
  );

  const extraJourneys = useMemo(
    () => journeys.filter((j) => j.tipo_jornada && !CATALOG_TIPO_JORNADAS.has(j.tipo_jornada)),
    [journeys],
  );

  const activeCount = jornadas.filter((j) => j.is_active).length;

  const pageLoading = storeListLoading || (selectedStoreId && (journeysLoading || seedJourneysMutation.isPending));

  if (storeListLoading && !selectedStoreId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!lojas.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center space-y-3 max-w-lg mx-auto">
        <p className="font-bold">Nenhuma loja encontrada</p>
        <p className="text-sm text-muted-foreground">Crie uma loja no onboarding para configurar jornadas.</p>
        <Button asChild className="rounded-xl font-bold">
          <Link to="/onboarding">Ir para onboarding</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {showModal && selectedStoreId ? (
        <AutomacaoModal storeId={selectedStoreId} onClose={() => setShowModal(false)} />
      ) : null}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase italic">
            Jornadas <span className="text-primary">Permanentes</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ligadas ao motor de envio (`journeys_config` + `flow-engine`) —{" "}
            <span className="text-foreground font-bold">{activeCount} ativas</span> nesta loja.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {lojas.length > 1 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-full sm:w-[220px] rounded-xl font-semibold">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <TrialGate action="ativar automações">
              <Button
                variant="outline"
                className="font-bold gap-2 rounded-xl"
                onClick={() => activateCoreFlowsMutation.mutate()}
                disabled={activateCoreFlowsMutation.isPending || !selectedStoreId || journeysError}
              >
                {activateCoreFlowsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Ativar fluxos core
              </Button>
            </TrialGate>
            <TrialGate action="criar jornadas customizadas">
              <Button
                className="font-bold gap-2 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                onClick={() => setShowModal(true)}
                disabled={!selectedStoreId || journeysError}
              >
                <Plus className="w-4 h-4" /> Criar Jornada Customizada
              </Button>
            </TrialGate>
          </div>
        </div>
      </div>

      {!whatsappOk && selectedStoreId && !journeysLoading && (
        <Alert className="rounded-2xl border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">WhatsApp não conectado nesta loja</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            O agendador envia mensagens pela Meta Cloud só com conexão ativa.{" "}
            <Link className="font-bold text-primary underline" to="/dashboard/whatsapp">
              Conectar WhatsApp
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Alert className="rounded-2xl border-border/60 bg-muted/20">
        <Link2 className="h-4 w-4" />
        <AlertTitle className="text-sm font-bold">Operação em produção</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
          Confirme secrets e cron das Edge Functions (<code className="text-[10px]">trigger-automations</code>,{" "}
          <code className="text-[10px]">process-scheduled-messages</code>) no painel Supabase. Consulte o checklist em{" "}
          <code className="text-[10px]">docs/production-env-checklist.md</code> no repositório e credenciais em{" "}
          <Link className="font-bold text-primary underline" to="/dashboard/configuracoes">
            Configurações
          </Link>
          .
        </AlertDescription>
      </Alert>

      {journeysError && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertTitle>Erro ao carregar jornadas</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm">{(journeysErrorObj as Error)?.message ?? "Tente novamente."}</span>
            <Button variant="outline" size="sm" className="w-fit gap-2 rounded-lg" onClick={() => refetchJourneys()}>
              <RefreshCw className="w-4 h-4" /> Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {pageLoading && !journeysError && (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          {seedJourneysMutation.isPending && (
            <p className="text-sm text-muted-foreground font-medium animate-pulse">A preparar jornadas padrão…</p>
          )}
        </div>
      )}

      {!pageLoading && !journeysError && (
        <>
          {activeCount === 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-sm font-bold text-amber-600">
                  Nenhuma jornada ativa — ative ao menos Carrinho Abandonado para começar a recuperar vendas.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jornadas.map((j) => (
              <div
                key={j.slug}
                className={cn(
                  "bg-card border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col",
                  j.is_active ? "border-primary/20 shadow-sm" : "border-border/50 opacity-70 grayscale",
                )}
              >
                <div className="p-6 space-y-4 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", j.bg)}>
                        <j.icon className={cn("w-5 h-5", j.color)} />
                      </div>
                      <div>
                        <h3 className="font-black text-sm leading-tight">{j.titulo}</h3>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {j.gatilho} · <span className="text-primary/80">{j.tipo_jornada}</span>
                        </p>
                      </div>
                    </div>
                    <TrialGate action="ativar automações">
                      <Switch
                        checked={j.is_active}
                        disabled={!j.dbId || toggleMutation.isPending}
                        onCheckedChange={(checked) => j.dbId && toggleMutation.mutate({ id: j.dbId, ativa: checked })}
                      />
                    </TrialGate>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">{j.desc}</p>

                  {(j as { templateVars?: string }).templateVars && (
                    <div className="bg-muted/40 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                        Variáveis (UI)
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground">{(j as { templateVars?: string }).templateVars}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">
                        No envio automático use <code className="font-mono">{"{{nome}}"}</code> e{" "}
                        <code className="font-mono">{"{{link}}"}</code> no modelo gravado em{" "}
                        <span className="font-mono">config_json</span>.
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {j.fluxo.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-black shrink-0">
                          {i + 1}
                        </div>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-6 pb-6 pt-2 border-t border-border/30 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">{j.kpi}</p>
                    <p className={cn("text-lg font-black font-mono truncate", j.color)}>
                      {(j.sent_count ?? 0).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[9px] text-muted-foreground">agendador · status &quot;sent&quot;</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px] font-mono">
                    {j.is_active ? "ativa" : "pausada"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {extraJourneys.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-black font-syne tracking-tight">Outras jornadas nesta loja</h2>
              <p className="text-xs text-muted-foreground">
                Tipos personalizados (ex.: API/webhook) devem disparar o mesmo identificador em{" "}
                <code className="font-mono">tipo_jornada</code> no <code className="font-mono">flow-engine</code>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extraJourneys.map((row) => {
                  const cfg = row.config_json as { display_name?: string } | null;
                  const label = cfg?.display_name?.trim() || row.tipo_jornada;
                  return (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold leading-tight break-all">{label}</span>
                      <TrialGate action="ativar automações">
                        <Switch
                          checked={!!row.ativa}
                          disabled={toggleMutation.isPending}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: row.id, ativa: checked })}
                        />
                      </TrialGate>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground break-all">{row.tipo_jornada}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Enviadas: {(sentByJourneyId[row.id] ?? 0).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
