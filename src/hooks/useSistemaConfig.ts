import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useSistemaConfig() {
  return useQuery({
    queryKey: ["system_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_config")
        .select("*")
        .eq("id", "config_geral")
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Verifica a cada 1 minuto
  });
}
