import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentUserAndStore } from "@/hooks/useDashboard";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import type { Database } from "@/integrations/supabase/types";
import { UI_NICHE_TO_SECTOR_DB, type BenchmarkNicheKey } from "@/lib/benchmark-niches";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Problema {
  titulo: string;
  descricao: string;
  severidade: "critico" | "alto" | "medio";
  impacto_reais: number;
  etapa?: "produto" | "carrinho" | "checkout" | "pagamento";
  evidencia?: string;
  confianca?: number;
  causa_raiz?: string;
}

export interface Recomendacao {
  titulo: string;
  descricao: string;
  esforco: "baixo" | "medio" | "alto";
  impacto_pp: number;
  prazo_semanas: number;
  tipo: "quick_win" | "ab_test" | "medio_prazo";
  owner?: "trafego" | "cro" | "crm" | "produto" | "dados";
}

export interface ExecutionPlaybookItem {
  id: string;
  action_key: string;
  action_title: string;
  owner: string | null;
  status: "pending" | "in_progress" | "done";
  planned_week: number | null;
  expected_lift_pp: number | null;
  expected_impact_reais: number | null;
  observed_result: string | null;
  observed_lift_pp: number | null;
  observed_impact_reais: number | null;
  updated_at: string;
}

export interface DiagnosticoJSON {
  resumo: string;
  perda_principal: string;
  percentual_explicado: number;
  problemas: Problema[];
  recomendacoes: Recomendacao[];
}

export interface DataHealthAlert {
  id: string;
  tipo: "missing_event" | "duplicate_event" | "tracking_drop" | "source_discrepancy";
  severidade: "critico" | "alto" | "medio";
  titulo: string;
  detalhe: string;
}

export interface DataHealthReport {
  score: number;
  status: "saudavel" | "atencao" | "critico";
  coberturaEventos: number;
  estabilidadeTracking: number;
  consistenciaFontes: number;
  deduplicacao: number;
  etapas: Array<{ etapa: "produto" | "carrinho" | "checkout" | "pagamento"; score: number }>;
  canais: Array<{
    canal: string;
    score: number;
    sent: number;
    delivered: number;
    read: number;
  }>;
  scoreMinimoRecomendacao: number;
  recomendacoesConfiaveis: boolean;
  metricContract: Array<{ metrica: string; definicao: string; tolerancia: string }>;
  alertas: DataHealthAlert[];
}

export interface MetricasFunil {
  visitantes: number;
  visualizacoes_produto: number;
  adicionou_carrinho: number;
  iniciou_checkout: number;
  compras: number;
  receita: number;
  fonte?: string;
  receita_travada_frete?: number;
  receita_travada_pagamento?: number;
  total_abandonos_frete?: number;
  total_abandonos_pagamento?: number;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

export const MOCK_METRICAS: MetricasFunil = {
  visitantes:            12400,
  visualizacoes_produto: 8930,
  adicionou_carrinho:    3472,
  iniciou_checkout:      1736,
  compras:               174,
  receita:               43500,
  fonte: "mockado",
  receita_travada_frete: 12500,
  receita_travada_pagamento: 8400,
  total_abandonos_frete: 42,
  total_abandonos_pagamento: 28,
};

/** Snapshot inicial após criar loja — evita gravar números de demonstração como se fossem reais. */
export const EMPTY_FUNIL_METRICAS: MetricasFunil = {
  visitantes: 0,
  visualizacoes_produto: 0,
  adicionou_carrinho: 0,
  iniciou_checkout: 0,
  compras: 0,
  receita: 0,
  fonte: "manual",
  receita_travada_frete: 0,
  receita_travada_pagamento: 0,
  total_abandonos_frete: 0,
  total_abandonos_pagamento: 0,
};

export const MOCK_CONFIG = {
  meta_conversao: 2.5,
  ticket_medio: 250,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Compute conversion % and drop % between steps */
export function calcFunil(m: MetricasFunil, meta: number, ticket: number) {
  const { visitantes: v, visualizacoes_produto: vp, adicionou_carrinho: ac, iniciou_checkout: ic, compras: c } = m;
  const pct = (a: number, b: number) => (b > 0 ? Number(((a / b) * 100).toFixed(1)) : 0);
  const taxaConversao = pct(c, v);
  const perdaMensal = Math.max(0, Math.round(((meta / 100) - (taxaConversao / 100)) * v * ticket));

  const etapas = [
    { label: "Visitantes",       valor: v,  barPct: 100,          dropPct: v  > 0  ? pct(v  - vp, v)  : 0, cor: "#3B82F6" },
    { label: "Produto visto",    valor: vp, barPct: pct(vp, v),   dropPct: vp > 0  ? pct(vp - ac, vp) : 0, cor: "#6366F1" },
    { label: "Adicionou carrinho",valor: ac, barPct: pct(ac, v),  dropPct: ac > 0  ? pct(ac - ic, ac) : 0, cor: "#F59E0B" },
    { label: "Iniciou checkout", valor: ic, barPct: pct(ic, v),   dropPct: ic > 0  ? pct(ic - c,  ic) : 0, cor: "#EF4444" },
    { label: "Pedido finalizado",valor: c,  barPct: pct(c,  v),   dropPct: 0,                              cor: "#DC2626" },
  ];

  const drops = [
    { label: "Visitantes → Produto",   drop: pct(v - vp, v) },
    { label: "Produto → Carrinho",      drop: pct(vp - ac, vp) },
    { label: "Carrinho → Checkout",     drop: pct(ac - ic, ac) },
    { label: "Checkout → Pedido",       drop: pct(ic - c, ic) },
  ];
  const maiorGargalo = drops.reduce((max, d) => d.drop > max.drop ? d : max, drops[0]);

  return { taxaConversao, perdaMensal, etapas, maiorGargalo };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Loja ativa (multi-loja: `sessionStorage` + escopo do dashboard). */
export function useLoja() {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeHint = scope?.activeStoreId;
  return useQuery({
    queryKey: ["convertiq-loja", user?.id ?? null, storeHint ?? ""],
    queryFn: async () => {
      const uid = await getUid();
      if (!uid) return null;
      const { storeId } = await getCurrentUserAndStore(storeHint);
      if (!storeId) return null;
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!user,
  });
}

/** Returns user's ConvertIQ config. */
export function useConvertIQConfig() {
  return useQuery({
    queryKey: ["convertiq-config"],
    queryFn: async () => {
      const uid = await getUid();
      if (!uid) return null;
      const { data } = await supabase
        .from("convertiq_settings")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      return data ?? null;
    },
  });
}

/** Returns latest funnel_metrics for the given store + period. */
export function useMetricasFunil(lojaId: string | null, periodo: "7d" | "30d" | "90d" = "30d") {
  return useQuery({
    queryKey: ["convertiq-metricas", lojaId, periodo],
    enabled: !!lojaId,
    queryFn: async () => {
      const diasMap = { "7d": 7, "30d": 30, "90d": 90 };
      const since = new Date(Date.now() - diasMap[periodo] * 86400_000).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("funnel_metrics")
        .select("*")
        .eq("store_id", lojaId!)
        .gte("data", since)
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export type FunilMetricasSource = "ga4" | "manual" | "none";

export interface FunilPageMetricasResult {
  metricas: MetricasFunil | null;
  source: FunilMetricasSource;
  /** ISO quando a fonte é GA4 (funil_diario) */
  lastIngestedAt: string | null;
  /** ISO da última linha manual (funnel_metrics) */
  lastManualUpdatedAt: string | null;
}

function funnelMetricsRowToMetricas(row: Record<string, unknown>): MetricasFunil {
  return {
    visitantes: Number(row.visitantes ?? 0),
    visualizacoes_produto: Number(row.visualizacoes_produto ?? 0),
    adicionou_carrinho: Number(row.adicionou_carrinho ?? 0),
    iniciou_checkout: Number(row.iniciou_checkout ?? 0),
    compras: Number(row.compras ?? 0),
    receita: Number(row.receita ?? 0),
    fonte: "manual",
  };
}

function funilDiarioRowToMetricas(row: {
  sessions?: number | null;
  view_item?: number | null;
  add_to_cart?: number | null;
  begin_checkout?: number | null;
  purchases?: number | null;
  purchase_revenue?: number | null;
}): MetricasFunil {
  return {
    visitantes: Number(row.sessions ?? 0),
    visualizacoes_produto: Number(row.view_item ?? 0),
    adicionou_carrinho: Number(row.add_to_cart ?? 0),
    iniciou_checkout: Number(row.begin_checkout ?? 0),
    compras: Number(row.purchases ?? 0),
    receita: Number(row.purchase_revenue ?? 0),
    fonte: "ga4",
  };
}

/** Prefer funil_diario (cron GA4) for the period, else latest funnel_metrics in window, else none (UI uses mock). */
export function useFunilPageMetricas(lojaId: string | null, periodo: "7d" | "30d" | "90d" = "30d") {
  return useQuery({
    queryKey: ["convertiq-funil-page-metricas", lojaId, periodo],
    enabled: !!lojaId,
    queryFn: async (): Promise<FunilPageMetricasResult> => {
      const { data: gaRow, error: gaErr } = await supabase
        .from("funil_diario")
        .select("sessions,view_item,add_to_cart,begin_checkout,purchases,purchase_revenue,ingested_at,metric_date")
        .eq("store_id", lojaId!)
        .eq("periodo", periodo)
        .order("metric_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (gaErr) throw gaErr;

      if (gaRow) {
        return {
          metricas: funilDiarioRowToMetricas(gaRow),
          source: "ga4",
          lastIngestedAt: gaRow.ingested_at ?? null,
          lastManualUpdatedAt: null,
        };
      }

      const diasMap = { "7d": 7, "30d": 30, "90d": 90 };
      const since = new Date(Date.now() - diasMap[periodo] * 86400_000).toISOString().split("T")[0];
      const { data: fmRow, error: fmErr } = await supabase
        .from("funnel_metrics")
        .select("*")
        .eq("store_id", lojaId!)
        .gte("data", since)
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fmErr) throw fmErr;

      if (fmRow) {
        return {
          metricas: funnelMetricsRowToMetricas(fmRow as Record<string, unknown>),
          source: "manual",
          lastIngestedAt: null,
          lastManualUpdatedAt: (fmRow as { created_at?: string | null }).created_at ?? null,
        };
      }

      return { metricas: null, source: "none", lastIngestedAt: null, lastManualUpdatedAt: null };
    },
  });
}

/** Percent of current revenue represented by recovery estimates; safe when receita is 0. */
export function recoveryPctOfRevenue(recFrete: number, recPag: number, receita: number): number | null {
  if (receita <= 0) return null;
  const pct = ((recFrete + recPag) / receita) * 100;
  if (!Number.isFinite(pct)) return null;
  return pct;
}

/** Returns the latest completed diagnostic for the given store. */
export function useLatestDiagnostico(lojaId: string | null) {
  return useQuery({
    queryKey: ["convertiq-last-diag", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diagnostics")
        .select("*")
        .eq("store_id", lojaId)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Returns the last 3 completed diagnostics. */
export function useDiagnosticos(lojaId: string | null) {
  return useQuery({
    queryKey: ["convertiq-diags", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diagnostics")
        .select("*")
        .eq("store_id", lojaId)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Linha agregada de `sector_benchmarks` para o segmento operacional (CVR/ticket referência). */
export function useSectorBenchmark(niche: BenchmarkNicheKey) {
  const dbSegment = UI_NICHE_TO_SECTOR_DB[niche];
  return useQuery({
    queryKey: ["sector-benchmark", dbSegment],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sector_benchmarks")
        .select("*")
        .eq("segmento", dbSegment)
        .maybeSingle();
      if (error) {
        console.warn("[useSectorBenchmark]", error.message);
        return null;
      }
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Save a store + config row during setup. */
export function useSaveLoja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      nome: string;
      plataforma: string;
      url?: string;
      ticket_medio?: number;
      meta_conversao?: number;
      ga4_property_id?: string;
      ga4_access_token?: string;
      pix_key?: string;
    }) => {
      const uid = await getUid();
      if (!uid) throw new Error("Não autenticado");

      // Upsert store (only columns that exist in the stores table)
      const storeRow: Database["public"]["Tables"]["stores"]["Insert"] = {
        user_id: uid,
        name: payload.nome,
        segment: payload.plataforma.toLowerCase(),
        pix_key: payload.pix_key ?? null,
      };
      const { data: store, error: storeErr } = await supabase
        .from("stores")
        .upsert(storeRow, { onConflict: "user_id" })
        .select()
        .single();

      if (storeErr) throw storeErr;

      // Upsert config
      const { error: cfgErr } = await supabase
        .from("convertiq_settings")
        .upsert(
          {
            user_id: uid,
            meta_conversao: payload.meta_conversao ?? 2.5,
            integracao_ga4: !!(payload.ga4_property_id && payload.ga4_access_token),
          },
          { onConflict: "user_id" }
        );

      if (cfgErr) throw cfgErr;
      return store;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["convertiq-loja"] });
      qc.invalidateQueries({ queryKey: ["convertiq-config"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stores-list"] });
    },
  });
}

/** Save manual funnel metrics. */
export function useSaveMetricas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { lojaId: string; metricas: Omit<MetricasFunil, "fonte"> }) => {
      const uid = await getUid();
      if (!uid) throw new Error("Não autenticado");
      const { error } = await supabase.from("funnel_metrics").upsert({
        user_id: uid,
        store_id: payload.lojaId,
        data: new Date().toISOString().split("T")[0],
        visitantes:            payload.metricas.visitantes,
        visualizacoes_produto: payload.metricas.visualizacoes_produto,
        adicionou_carrinho:    payload.metricas.adicionou_carrinho,
        iniciou_checkout:      payload.metricas.iniciou_checkout,
        compras:               payload.metricas.compras,
        receita:               payload.metricas.receita,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["convertiq-metricas", vars.lojaId] });
      qc.invalidateQueries({ queryKey: ["convertiq-funil-page-metricas", vars.lojaId] });
      toast.success("Métricas salvas com sucesso");
    },
    onError: (e) => toast.error(`Erro ao salvar: ${(e as Error).message}`),
  });
}

/** Create a diagnostico row + call the edge function. */
export function useGerarDiagnostico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      lojaId: string;
      metricas: MetricasFunil;
      metaConversao: number;
    }) => {
      const uid = await getUid();
      if (!uid) throw new Error("Não autenticado");

      const { data: diagRow, error: diagErr } = await supabase
        .from("diagnostics")
        .insert({
          user_id: uid,
          store_id: payload.lojaId,
          status: "pending",
          meta_conversao: payload.metaConversao,
          dados_funil: payload.metricas as unknown as Record<string, unknown>,
        })
        .select()
        .single();

      if (diagErr || !diagRow) throw diagErr ?? new Error("Erro ao criar diagnóstico");

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const fnRes = await supabase.functions.invoke("gerar-diagnostico", {
        body: { diagnostico_id: diagRow.id },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (fnRes.error) {
        const name = (fnRes.error as { name?: string }).name;
        const hint =
          name === "FunctionsFetchError" || /fetch/i.test(fnRes.error.message)
            ? " Verifique rede, CORS e se a edge `gerar-diagnostico` está deployada."
            : "";
        throw new Error(`${fnRes.error.message}${hint}`);
      }

      const body = fnRes.data as { success?: boolean; error?: string } | null;
      if (body && typeof body === "object" && body.success === false && body.error) {
        throw new Error(body.error);
      }

      return diagRow.id as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ["convertiq-last-diag", vars.lojaId] });
      qc.invalidateQueries({ queryKey: ["convertiq-diags", vars.lojaId] });
    },
    onError: (e) => {
      const msg = (e as Error).message;
      const isTimeout = /timed out|timeout|aborted/i.test(msg);
      toast.error(
        isTimeout
          ? "O diagnóstico IA demorou demais. Tente de novo; se repetir, confira logs da edge e ANTHROPIC_API_KEY no Supabase."
          : `Erro ao gerar diagnóstico: ${msg}`,
      );
    },
  });
}

export function useExecutionPlaybooks(lojaId: string | null) {
  return useQuery({
    queryKey: ["convertiq-execution-playbooks", lojaId],
    enabled: !!lojaId,
    queryFn: async (): Promise<ExecutionPlaybookItem[]> => {
      const uid = await getUid();
      if (!uid) return [];
      // Tabela ainda não incluída no `Database` gerado
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("convertiq_execution_playbooks")
        .select("id,action_key,action_title,owner,status,planned_week,expected_lift_pp,expected_impact_reais,observed_result,observed_lift_pp,observed_impact_reais,updated_at")
        .eq("user_id", uid)
        .eq("store_id", lojaId!)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ExecutionPlaybookItem[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertExecutionPlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      lojaId: string;
      diagnosticoId?: string | null;
      actionKey: string;
      actionTitle: string;
      owner?: string;
      status?: "pending" | "in_progress" | "done";
      plannedWeek?: number;
      expectedLiftPp?: number;
      expectedImpactReais?: number;
      observedResult?: string | null;
      observedLiftPp?: number | null;
      observedImpactReais?: number | null;
    }) => {
      const uid = await getUid();
      if (!uid) throw new Error("Não autenticado");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- convertiq_execution_playbooks fora do types gerado
      const { error } = await (supabase as any)
        .from("convertiq_execution_playbooks")
        .upsert(
          {
            user_id: uid,
            store_id: payload.lojaId,
            diagnostico_id: payload.diagnosticoId ?? null,
            action_key: payload.actionKey,
            action_title: payload.actionTitle,
            owner: payload.owner ?? null,
            status: payload.status ?? "pending",
            planned_week: payload.plannedWeek ?? null,
            expected_lift_pp: payload.expectedLiftPp ?? null,
            expected_impact_reais: payload.expectedImpactReais ?? null,
            observed_result: payload.observedResult ?? null,
            observed_lift_pp: payload.observedLiftPp ?? null,
            observed_impact_reais: payload.observedImpactReais ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id,action_key" }
        );

      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["convertiq-execution-playbooks", vars.lojaId] });
    },
  });
}

/** Test GA4 connection via edge function buscar-ga4. */
export async function testarGA4(ga4_property_id: string, access_token: string) {
  const res = await supabase.functions.invoke("buscar-ga4", {
    body: { ga4_property_id, access_token, periodo: "30d" },
  });
  if (res.error) throw new Error(res.error.message);
  const body = res.data as { success: boolean; metricas?: MetricasFunil; error?: string };
  if (!body.success) throw new Error(body.error ?? "Erro desconhecido");
  return body.metricas!;
}

/** 
 * Returns enriched metrics from abandoned_carts table 
 */
export function useMetricasEnriquecidas(lojaId: string | null, periodo: "7d" | "30d" | "90d" = "30d") {
  return useQuery({
    queryKey: ["convertiq-enriched", lojaId, periodo],
    enabled: !!lojaId,
    queryFn: async () => {
      const diasMap = { "7d": 7, "30d": 30, "90d": 90 };
      const since = new Date(Date.now() - diasMap[periodo] * 86400_000).toISOString();

      const { data, error } = await supabase
        .from("abandoned_carts")
        .select("cart_value, cart_items, customer_phone, status")
        .eq("store_id", lojaId!)
        .gte("created_at", since);

      if (error) throw error;

      let receitaFrete = 0;
      let totalFrete = 0;
      let receitaPagamento = 0;
      let totalPagamento = 0;

      type CartRow = Database["public"]["Tables"]["abandoned_carts"]["Row"];
      (data ?? []).forEach((cart: CartRow) => {
        const val = Number(cart.cart_value || 0);
        // Simple heuristic: count all pending carts as potential frete/payment drops
        if (val > 0 && cart.status === "pending") {
          receitaFrete += val * 0.4; // estimate 40% frete-related
          totalFrete++;
          receitaPagamento += val * 0.3; // estimate 30% payment-related
          totalPagamento++;
        }
      });

      return {
        receita_travada_frete: receitaFrete,
        total_abandonos_frete: totalFrete,
        receita_travada_pagamento: receitaPagamento,
        total_abandonos_pagamento: totalPagamento
      };
    },
  });
}

export function useDataHealth(lojaId: string | null, periodo: "7d" | "30d" | "90d" = "30d") {
  return useQuery({
    queryKey: ["convertiq-data-health", lojaId, periodo],
    enabled: !!lojaId,
    queryFn: async (): Promise<DataHealthReport> => {
      const diasMap = { "7d": 7, "30d": 30, "90d": 90 };
      const sinceDate = new Date(Date.now() - diasMap[periodo] * 86400_000);
      const since = sinceDate.toISOString().split("T")[0];

      const [analyticsRes, metricsRes, campaignsRes] = await Promise.all([
        supabase
          .from("analytics_daily")
          .select("date,messages_sent,messages_delivered,messages_read,new_contacts,revenue_influenced")
          .eq("store_id", lojaId!)
          .gte("date", since)
          .order("date", { ascending: true }),
        supabase
          .from("funnel_metrics")
          .select("data,visitantes,visualizacoes_produto,adicionou_carrinho,iniciou_checkout,compras,receita")
          .eq("store_id", lojaId!)
          .gte("data", since)
          .order("data", { ascending: true }),
        supabase
          .from("campaigns")
          .select("channel,sent_count,delivered_count,read_count")
          .eq("store_id", lojaId!)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const analytics = analyticsRes.data ?? [];
      const metrics = metricsRes.data ?? [];
      const campaigns = campaignsRes.data ?? [];
      const alertas: DataHealthAlert[] = [];

      const sent = analytics.reduce((s, d) => s + Number(d.messages_sent ?? 0), 0);
      const delivered = analytics.reduce((s, d) => s + Number(d.messages_delivered ?? 0), 0);
      const read = analytics.reduce((s, d) => s + Number(d.messages_read ?? 0), 0);
      const revenueAnalytics = analytics.reduce((s, d) => s + Number(d.revenue_influenced ?? 0), 0);
      const revenueFunnel = metrics.reduce((s, d) => s + Number(d.receita ?? 0), 0);
      const compras = metrics.reduce((s, d) => s + Number(d.compras ?? 0), 0);
      const visualizacoes = metrics.reduce((s, d) => s + Number(d.visualizacoes_produto ?? 0), 0);
      const addCart = metrics.reduce((s, d) => s + Number(d.adicionou_carrinho ?? 0), 0);
      const checkout = metrics.reduce((s, d) => s + Number(d.iniciou_checkout ?? 0), 0);

      const coberturaEventos = sent > 0 ? Math.max(0, Math.min(100, Math.round((delivered / sent) * 100))) : 50;
      const deduplicacao = delivered > 0 ? Math.max(0, Math.min(100, 100 - Math.max(0, Math.round(((read - delivered) / delivered) * 100)))) : 80;

      const diasComAnalytics = analytics.length;
      const diasEsperados = Math.max(1, diasMap[periodo]);
      const estabilidadeTracking = Math.max(0, Math.min(100, Math.round((diasComAnalytics / diasEsperados) * 100)));

      const discrepanciaFontes =
        revenueAnalytics > 0 || revenueFunnel > 0
          ? Math.abs(revenueAnalytics - revenueFunnel) / Math.max(revenueAnalytics, revenueFunnel, 1)
          : 0.2;
      const consistenciaFontes = Math.max(0, Math.min(100, Math.round((1 - discrepanciaFontes) * 100)));

      if (coberturaEventos < 80) {
        alertas.push({
          id: "missing-events",
          tipo: "missing_event",
          severidade: coberturaEventos < 60 ? "critico" : "alto",
          titulo: "Eventos ausentes no tracking",
          detalhe: `Apenas ${coberturaEventos}% das mensagens enviadas chegaram como entregues.`,
        });
      }

      if (deduplicacao < 92) {
        alertas.push({
          id: "duplicate-events",
          tipo: "duplicate_event",
          severidade: deduplicacao < 85 ? "alto" : "medio",
          titulo: "Possível duplicidade de eventos",
          detalhe: "Leituras acima do esperado sugerem duplicidade em parte dos eventos.",
        });
      }

      if (estabilidadeTracking < 85) {
        alertas.push({
          id: "tracking-drop",
          tipo: "tracking_drop",
          severidade: estabilidadeTracking < 60 ? "critico" : "alto",
          titulo: "Queda de tracking",
          detalhe: `Somente ${diasComAnalytics} dias com dados no período de ${diasMap[periodo]} dias.`,
        });
      }

      if (consistenciaFontes < 85) {
        alertas.push({
          id: "source-discrepancy",
          tipo: "source_discrepancy",
          severidade: consistenciaFontes < 70 ? "critico" : "alto",
          titulo: "Discrepância entre fontes",
          detalhe: `Receita em analytics (${Math.round(revenueAnalytics)}) diverge da receita do funil (${Math.round(revenueFunnel)}).`,
        });
      }

      if (compras > 0 && revenueFunnel === 0) {
        alertas.push({
          id: "missing-revenue",
          tipo: "missing_event",
          severidade: "critico",
          titulo: "Compras sem receita registrada",
          detalhe: "Existem compras no funil, mas sem receita associada no período.",
        });
      }

      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            coberturaEventos * 0.35 +
            estabilidadeTracking * 0.25 +
            consistenciaFontes * 0.25 +
            deduplicacao * 0.15
          )
        )
      );

      const ratio = (num: number, den: number) => (den > 0 ? Math.max(0, Math.min(1, num / den)) : 0);
      const etapas = [
        { etapa: "produto" as const, score: Math.round(ratio(visualizacoes, Math.max(visualizacoes, addCart, 1)) * 100) },
        { etapa: "carrinho" as const, score: Math.round(ratio(addCart, Math.max(visualizacoes, 1)) * 100) },
        { etapa: "checkout" as const, score: Math.round(ratio(checkout, Math.max(addCart, 1)) * 100) },
        { etapa: "pagamento" as const, score: Math.round(ratio(compras, Math.max(checkout, 1)) * 100) },
      ];

      const scoreMinimoRecomendacao = 70;
      const recomendacoesConfiaveis = score >= scoreMinimoRecomendacao;
      const metricContract = [
        { metrica: "CVR", definicao: "compras / visitantes", tolerancia: "±3pp entre fontes" },
        { metrica: "AOV", definicao: "receita / compras", tolerancia: "±5%" },
        { metrica: "LTV", definicao: "ticket_medio * ciclos médios", tolerancia: "±10%" },
        { metrica: "CAC", definicao: "investimento mídia / novos clientes", tolerancia: "±8%" },
        { metrica: "Payback", definicao: "CAC / margem de contribuição", tolerancia: "±10%" },
        { metrica: "Retenção D30", definicao: "clientes ativos em 30 dias / coorte inicial", tolerancia: "±5pp" },
      ];

      const byChannel = campaigns.reduce((acc, c) => {
        const ch = (c.channel ?? "whatsapp").toLowerCase();
        if (!acc[ch]) acc[ch] = { canal: ch, sent: 0, delivered: 0, read: 0 };
        acc[ch].sent += Number(c.sent_count ?? 0);
        acc[ch].delivered += Number(c.delivered_count ?? 0);
        acc[ch].read += Number(c.read_count ?? 0);
        return acc;
      }, {} as Record<string, { canal: string; sent: number; delivered: number; read: number }>);

      const canais = Object.values(byChannel)
        .map((ch) => {
          const delivery = ch.sent > 0 ? ch.delivered / ch.sent : 0;
          const readRate = ch.delivered > 0 ? ch.read / ch.delivered : 0;
          const channelScore = Math.round(Math.max(0, Math.min(100, delivery * 70 + readRate * 30)));
          return { ...ch, score: channelScore };
        })
        .sort((a, b) => b.score - a.score);

      return {
        score,
        status: score >= 85 ? "saudavel" : score >= 65 ? "atencao" : "critico",
        coberturaEventos,
        estabilidadeTracking,
        consistenciaFontes,
        deduplicacao,
        etapas,
        canais,
        scoreMinimoRecomendacao,
        recomendacoesConfiaveis,
        metricContract,
        alertas,
      };
    },
    staleTime: 60_000,
  });
}

export {
  GA4_SNAPSHOT_MAX_AGE_MS,
  funilGa4StaleHint,
  funilGa4StaleSnapshotBadgeLabel,
  isFunilGa4SnapshotRecent,
} from "@/lib/funil-ga4-freshness";
