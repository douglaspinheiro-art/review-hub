import { useAuthContext, type Profile } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * Hook to access authentication state. 
 * Now uses a centralized AuthContext to prevent redundant listeners and fetches.
 */
export function useAuth() {
  const context = useAuthContext();

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signUp(email: string, password: string, meta: { full_name: string; plataforma?: string; company_name?: string }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: meta },
    });
    return { data, error };
  }

  return { 
    ...context,
    signIn,
    signUp,
  };
}

export type { Profile };
