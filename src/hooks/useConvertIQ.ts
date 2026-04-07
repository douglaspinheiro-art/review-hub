import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Problema {
  titulo: string;
  descricao: string;
  severidade: "critico" | "alto" | "medio";
  impacto_reais: number;
}

export interface Recomendacao {
  titulo: string;
  descricao: string;
  esforco: "baixo" | "medio" | "alto";
  impacto_pp: number;
  prazo_semanas: number;
  tipo: "quick_win" | "ab_test" | "medio_prazo";
}

export interface DiagnosticoJSON {
  resumo: string;
  perda_principal: string;
  percentual_explicado: number;
  problemas: Problema[];
  recomendacoes: Recomendacao[];
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

/** Returns user's first store (or null). */
export function useLoja() {
  return useQuery({
    queryKey: ["convertiq-loja"],
    queryFn: async () => {
      const uid = await getUid();
      if (!uid) return null;
      const { data } = await supabase
        .from("stores")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
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
      const { data } = await supabase
        .from("funnel_metrics")
        .select("*")
        .eq("store_id", lojaId!)
        .gte("data", since)
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
}

/** Returns the latest completed diagnostic for the given store. */
export function useLatestDiagnostico(lojaId: string | null) {
  return useQuery({
    queryKey: ["convertiq-last-diag", lojaId],
    enabled: !!lojaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("diagnostics")
        .select("*")
        .eq("user_id", (await getUid())!)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
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
      const { data } = await supabase
        .from("diagnostics")
        .select("*")
        .eq("user_id", (await getUid())!)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
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
      const { data: store, error: storeErr } = await supabase
        .from("stores")
        .upsert(
          {
            user_id: uid,
            name: payload.nome,
            segment: payload.plataforma.toLowerCase(),
            pix_key: payload.pix_key ?? null,
          } as any,
          { onConflict: "user_id" }
        )
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

      if (fnRes.error) throw fnRes.error;

      return diagRow.id as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ["convertiq-last-diag", vars.lojaId] });
      qc.invalidateQueries({ queryKey: ["convertiq-diags", vars.lojaId] });
    },
    onError: (e) => toast.error(`Erro ao gerar diagnóstico: ${(e as Error).message}`),
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

      (data ?? []).forEach((cart: any) => {
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
