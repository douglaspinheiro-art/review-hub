import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Secure admin check via user_roles table + has_role() SECURITY DEFINER function.
 * Does NOT rely on profiles.role (client-side, easily spoofable).
 */
export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });

      if (error) {
        console.warn("has_role RPC error:", error.message);
        return false;
      }

      return data === true;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
