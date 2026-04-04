import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// --- Types ---
export interface LojaV3 {
  id: string;
  nome: string;
  conversion_health_score: number;
  chs_label: string;
  chs_historico: any[];
  segmento: string;
}

export interface MetricasFunilV3 {
  visitantes: number;
  produto_visto: number;
  carrinho: number;
  checkout: number;
  pedido: number;
  visitantes_mobile: number;
  pedidos_mobile: number;
  cvr_mobile: number;
  cvr_desktop: number;
}

// --- Hooks ---

export function useLojaV3(lojaId?: string) {
  return useQuery({
    queryKey: ["loja_v3", lojaId],
    queryFn: async () => {
      if (!lojaId) return null;
      const { data, error } = await supabase
        .from("lojas")
        .select("*")
        .eq("id", lojaId)
        .single();
      if (error) throw error;
      return data as LojaV3;
    },
    enabled: !!lojaId,
  });
}

export function useProblemasV3(lojaId?: string) {
  return useQuery({
    queryKey: ["problemas_v3", lojaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("problemas")
        .select("*")
        .eq("loja_id", lojaId)
        .order("detectado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!lojaId,
  });
}

export function usePrescricoesV3(lojaId?: string) {
  return useQuery({
    queryKey: ["prescricoes_v3", lojaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescricoes")
        .select("*, problemas(*)")
        .eq("loja_id", lojaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!lojaId,
  });
}

export function useProdutosV3(lojaId?: string, filter = "todos") {
  return useQuery({
    queryKey: ["produtos_v3", lojaId, filter],
    queryFn: async () => {
      let query = supabase.from("produtos").select("*").eq("loja_id", lojaId);
      
      if (filter === "estoque_critico") query = query.lt("estoque", 5);
      if (filter === "baixa_cvr") query = query.lt("taxa_conversao_produto", 10);

      const { data, error } = await query.order("receita_30d", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!lojaId,
  });
}

export function useMetricasV3(lojaId?: string) {
  return useQuery({
    queryKey: ["metricas_funil_v3", lojaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metricas_funil_v3")
        .select("*")
        .eq("loja_id", lojaId)
        .order("data_referencia", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as MetricasFunilV3;
    },
    enabled: !!lojaId,
  });
}

export function useWebhookLogs(lojaId?: string, isAdmin = false) {
  return useQuery({
    queryKey: ["webhook_logs", lojaId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from("webhook_logs")
        .select("*, lojas(nome)")
        .order("created_at", { ascending: false });
      
      if (!isAdmin && lojaId) {
        query = query.eq("loja_id", lojaId);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
    enabled: isAdmin || !!lojaId,
  });
}
