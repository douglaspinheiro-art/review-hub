import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Platform staff: `user_roles` + `has_role()` SECURITY DEFINER (authoritative on the server).
 * Used for maintenance bypass, `/dashboard/operacoes`, and RLS policies tied to `has_role(..., 'admin')`.
 *
 * For account/tenant administrators (billing owner / loja), use `useAuth().isTenantAdmin` (`profiles.role`).
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
