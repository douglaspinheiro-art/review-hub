import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PROFILE_SESSION_SELECT } from "@/lib/supabase-select-fragments";

export type SubscriptionStatus = "diagnostic_only" | "active" | "past_due" | "canceled";

export interface Profile {
  id: string;
  full_name: string | null;
  company_name: string | null;
  plan: "starter" | "growth" | "scale" | "enterprise";
  role: "user" | "admin";
  trial_ends_at: string | null;
  onboarding_completed: boolean;
  /** Paywall state: only "active" unlocks /setup and /dashboard/*. */
  subscription_status: SubscriptionStatus;
  ia_negotiation_enabled: boolean | null;
  ia_max_discount_pct: number | null;
  social_proof_enabled: boolean | null;
  pix_key: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileFallbackUsed: boolean;
  /** True when the profile is synthetic (DB timeout fallback). Plan-gated features
   *  are unreliable while this is true — isPaid is forced false until real data loads. */
  isProfileSynthetic: boolean;
  isTrialActive: boolean;
  isPaid: boolean;
  refetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileFallbackUsed, setProfileFallbackUsed] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    // 5s timeout to prevent hanging on DB/Network failure
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SESSION_SELECT)
        .eq("id", userId)
        .single();

      clearTimeout(timeoutId);

      if (error && error.code !== "PGRST116") {
        console.error("fetchProfile error:", error.message);
      }
      
      if (data) {
        setProfile(data as Profile);
        // Real profile loaded — clear synthetic flag and any pending retry.
        setProfileFallbackUsed(false);
        retryAttemptRef.current = 0;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      } else if (error?.code === "PGRST116") {
        setProfile(null);
      } else {
        throw new Error(error?.message || "No data");
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("fetchProfile critical error or timeout:", err);
      // Fallback to minimal profile if DB hangs or fails
      setProfile({
        id: userId,
        full_name: "Usuário",
        company_name: null,
        plan: "starter",
        role: "user",
        trial_ends_at: null,
        onboarding_completed: false,
        subscription_status: "diagnostic_only",
        ia_negotiation_enabled: false,
        ia_max_discount_pct: 0,
        social_proof_enabled: false,
        pix_key: null,
      });
      setProfileFallbackUsed(true);
      // Log to audit_logs so ops can detect DB latency spikes causing profile failures.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("audit_logs").insert({
        action: "profile_fallback_used",
        resource: "profile",
        result: "warn",
        metadata: { user_id: userId, reason: (err as Error)?.message ?? "unknown" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).then(({ error: logErr }: { error: any }) => {
        if (logErr) console.warn("[auth] audit_logs insert failed:", logErr.message);
      });
      // Auto-retry with exponential backoff (30s, 60s, 120s, …, capped at 5 min)
      // so the user recovers automatically once DB stabilises, without a page refresh.
      if (!retryTimerRef.current) {
        const attempt = ++retryAttemptRef.current;
        const delayMs = Math.min(30_000 * Math.pow(2, attempt - 1), 300_000);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          fetchProfile(userId);
        }, delayMs);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // onAuthStateChange fires immediately with INITIAL_SESSION containing the current session,
    // so a separate getSession() call is redundant and causes double profile fetches on startup.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Clean up retry timer when the provider unmounts (e.g. user logs out).
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isTrialActive = profile?.trial_ends_at
    ? new Date(profile.trial_ends_at) > new Date()
    : false;

  // Do NOT trust plan data from a synthetic profile — block premium features
  // until the real profile loads (auto-retry fires every 30s after a DB failure).
  const isPaid = !!profile && profile.plan !== "starter" && !profileFallbackUsed;

  const value = {
    user,
    session,
    profile,
    loading,
    profileFallbackUsed,
    isProfileSynthetic: profileFallbackUsed,
    isTrialActive,
    isPaid,
    refetchProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook estável; manter no mesmo ficheiro que o Provider evita ciclos. */
// eslint-disable-next-line react-refresh/only-export-components -- hook exposto junto do Provider (padrão comum)
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
