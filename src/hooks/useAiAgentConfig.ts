import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import type { Database } from "@/integrations/supabase/types";

export type AiAgentConfigRow = Database["public"]["Tables"]["ai_agent_config"]["Row"];

export const aiAgentConfigQueryKey = (userId: string | undefined, storeId: string | undefined) =>
  ["ai-agent-config", userId ?? "", storeId ?? ""] as const;

export type AiAgentAction = {
  id: string;
  action: string;
  resource: string;
  metadata: any;
  created_at: string;
};

export type AiAgentConfigQueryResult = {
  storeId: string;
  row: AiAgentConfigRow | null;
  ownerId: string;
  recentActions: AiAgentAction[];
};

/**
 * Configuração do agente por loja, alinhada ao tenant (contexto StoreScopeContext + RLS em `ai_agent_config`).
 * Consolidado via RPC para trazer histórico recente de ações.
 */
export function useAiAgentConfig(storeId: string | undefined, userId: string | undefined) {
  const scope = useStoreScopeOptional();
  return useQuery({
    queryKey: aiAgentConfigQueryKey(userId, storeId),
    enabled: !!userId && !!storeId && scope?.ready === true,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AiAgentConfigQueryResult> => {
      const ownerId = scope?.effectiveUserId ?? userId!;
      
      const { data, error } = await (supabase as any).rpc("get_ai_agent_bundle_v2", {
        p_store_id: storeId as string,
      });

      if (error) throw error;
      const res = data as any;
      
      return { 
        storeId: storeId as string, 
        row: res.config as AiAgentConfigRow | null, 
        ownerId,
        recentActions: (res.recent_actions || []) as AiAgentAction[],
      };
    },
  });
}
