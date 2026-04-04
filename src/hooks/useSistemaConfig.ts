import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useSistemaConfig() {
  return useQuery({
    queryKey: ["sistema_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sistema_config")
        .select("*")
        .eq("id", "config_geral")
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Verifica a cada 1 minuto
  });
}
