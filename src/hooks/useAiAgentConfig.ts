import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCurrentUserAndStore } from "@/hooks/useDashboard";
import type { Database } from "@/integrations/supabase/types";

export type AiAgentConfigRow = Database["public"]["Tables"]["ai_agent_config"]["Row"];

export const aiAgentConfigQueryKey = (userId: string | undefined, storeId: string | undefined) =>
  ["ai-agent-config", userId ?? "", storeId ?? ""] as const;

export type AiAgentConfigQueryResult = {
  storeId: string;
  row: AiAgentConfigRow | null;
  ownerId: string;
};

/**
 * Configuração do agente por loja, alinhada ao tenant (`getCurrentUserAndStore` + RLS em `ai_agent_config`).
 */
export function useAiAgentConfig(storeId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: aiAgentConfigQueryKey(userId, storeId),
    enabled: !!userId && !!storeId,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AiAgentConfigQueryResult> => {
      const { effectiveUserId } = await getCurrentUserAndStore();
      const ownerId = effectiveUserId ?? userId!;
      const { data, error } = await supabase
        .from("ai_agent_config")
        .select("id,store_id,user_id,ativo,modo,personalidade_preset,prompt_sistema,tom_de_voz,conhecimento_loja,updated_at")
        .eq("store_id", storeId as string)
        .maybeSingle();
      if (error) throw error;
      return { storeId: storeId as string, row: data, ownerId };
    },
  });
}
