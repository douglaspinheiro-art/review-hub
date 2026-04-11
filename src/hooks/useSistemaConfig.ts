import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface SystemConfig {
  id: string;
  maintenance_active: boolean;
  maintenance_message: string | null;
  updated_at: string;
}

export function useSistemaConfig() {
  return useQuery({
    queryKey: ["system_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_config")
        .select("*")
        .eq("id", "config_geral")
        .single();
      if (error) {
        // Table may not exist in types yet — fail gracefully
        console.warn("system_config query error:", error.message);
        return { maintenance_active: false, maintenance_message: null } as SystemConfig;
      }
      return data as SystemConfig;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
