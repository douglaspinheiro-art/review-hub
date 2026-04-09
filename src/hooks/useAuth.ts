import { useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  full_name: string | null;
  company_name: string | null;
  plan: "starter" | "growth" | "scale" | "enterprise";
  role: "user" | "admin";
  trial_ends_at: string | null;
  onboarding_completed: boolean;
  ia_negotiation_enabled: boolean | null;
  ia_max_discount_pct: number | null;
  social_proof_enabled: boolean | null;
  pix_key: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error && error.code !== "PGRST116") {
      console.error("fetchProfile error:", error.message);
    }
    setProfile(data as Profile | null);
    setLoading(false);
  }

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  const isTrialActive = profile?.trial_ends_at
    ? new Date(profile.trial_ends_at) > new Date()
    : false;

  // Fail-safe: only mark as paid when profile is loaded and explicitly non-starter.
  const isPaid = !!profile && profile.plan !== "starter";

  return { user, session, profile, loading, signIn, signUp, signOut, isTrialActive, isPaid };
}
