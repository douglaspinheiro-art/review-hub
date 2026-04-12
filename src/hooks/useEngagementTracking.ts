/**
 * Server-side streak, NPS and milestone tracking.
 *
 * Replaces the localStorage-based engagement state in Dashboard so that
 * multi-device users share a single streak count and never see duplicate toasts.
 *
 * Requires migration: 20260420120000_profiles_engagement_tracking.sql
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const ENGAGEMENT_SELECT =
  "streak_count,streak_last_visit_date,streak_7_shown,streak_30_shown,nps_shown_at,milestone_1k_shown,created_at";

type EngagementRow = {
  streak_count: number;
  streak_last_visit_date: string | null;
  streak_7_shown: boolean;
  streak_30_shown: boolean;
  nps_shown_at: string | null;
  milestone_1k_shown: boolean;
  created_at: string;
};

type EngagementState = {
  streak: number;
  streakMilestone: string | null;
  showNPS: boolean;
  milestone: string | null;
};

function todayUtcDate(): string {
  return new Date().toISOString().split("T")[0];
}

function yesterdayUtcDate(): string {
  const d = new Date(Date.now() - 86_400_000);
  return d.toISOString().split("T")[0];
}

/**
 * Reads engagement data from Supabase `profiles`, updates streak on new visits,
 * and returns flags for streak milestone toast, NPS modal, and 1k milestone.
 *
 * Falls back to localStorage silently if the columns don't exist yet (pre-migration).
 */
export function useEngagementTracking(userId: string | null): EngagementState & {
  dismissNPS: () => void;
  dismissMilestone: () => void;
  dismissStreakMilestone: () => void;
} {
  const [state, setState] = useState<EngagementState>({
    streak: 0,
    streakMilestone: null,
    showNPS: false,
    milestone: null,
  });
  // Track which userId was last initialized to detect user changes (e.g. logout → re-login on same tab)
  const initializedForRef = useRef<string | null>(null);

  const dismissNPS = () => setState(s => ({ ...s, showNPS: false }));
  const dismissMilestone = () => setState(s => ({ ...s, milestone: null }));
  const dismissStreakMilestone = () => setState(s => ({ ...s, streakMilestone: null }));

  useEffect(() => {
    if (!userId || initializedForRef.current === userId) return;
    initializedForRef.current = userId;

    void (async () => {
      const today = todayUtcDate();
      const yesterday = yesterdayUtcDate();

      const { data: row, error } = await supabase
        .from("profiles")
        .select(ENGAGEMENT_SELECT)
        .eq("id", userId)
        .single();

      if (error || !row) {
        // Columns may not exist yet (pre-migration). Fall back to localStorage.
        fallbackToLocalStorage(setState);
        return;
      }

      const eng = row as EngagementRow;
      const lastVisit = eng.streak_last_visit_date;

      // Same day — just restore streak display
      if (lastVisit === today) {
        setState(s => ({ ...s, streak: eng.streak_count }));
        return;
      }

      // New day — compute new streak
      const newStreak = lastVisit === yesterday ? eng.streak_count + 1 : 1;
      const patch: Partial<EngagementRow> = {
        streak_count: newStreak,
        streak_last_visit_date: today,
      };

      const timers: ReturnType<typeof setTimeout>[] = [];
      let newStreakMilestone: string | null = null;

      if (newStreak === 7 && !eng.streak_7_shown) {
        newStreakMilestone = "7 dias seguidos!";
        patch.streak_7_shown = true;
      } else if (newStreak === 30 && !eng.streak_30_shown) {
        newStreakMilestone = "30 dias seguidos! Você é top 5% dos usuários.";
        patch.streak_30_shown = true;
      }

      // NPS: show once after 30 days of account age
      let showNPS = false;
      if (!eng.nps_shown_at && eng.created_at) {
        const daysSince = Math.floor((Date.now() - new Date(eng.created_at).getTime()) / 86_400_000);
        if (daysSince >= 30) {
          showNPS = true;
          patch.nps_shown_at = new Date().toISOString();
        }
      }

      // 1k milestone: checked separately via localStorage prescription count
      let showMilestone = false;
      if (!eng.milestone_1k_shown) {
        try {
          const approved = parseInt(localStorage.getItem("ltv_prescricoes_aprovadas") || "0", 10);
          if (approved > 0) {
            showMilestone = true;
            patch.milestone_1k_shown = true;
          }
        } catch { /* ignore */ }
      }

      // Persist to Supabase — log silently if it fails (UI already updated optimistically)
      supabase.from("profiles").update(patch).eq("id", userId).then(({ error }) => {
        if (error) console.warn("[useEngagementTracking] Failed to persist engagement state:", error.message);
      });

      // Update local state (with small delays for milestone/NPS toasts)
      setState(s => ({ ...s, streak: newStreak }));

      if (newStreakMilestone) {
        const t = setTimeout(() => setState(s => ({ ...s, streakMilestone: newStreakMilestone })), 800);
        timers.push(t);
      }
      if (showNPS) {
        const t = setTimeout(() => setState(s => ({ ...s, showNPS: true })), 5000);
        timers.push(t);
      }
      if (showMilestone) {
        const t = setTimeout(() => setState(s => ({ ...s, milestone: "R$ 1.000 recuperados" })), 1000);
        timers.push(t);
      }

      return () => timers.forEach(clearTimeout);
    })();
  }, [userId]);

  return { ...state, dismissNPS, dismissMilestone, dismissStreakMilestone };
}

/** Fallback to localStorage when Supabase columns are not yet available (pre-migration). */
function fallbackToLocalStorage(setState: React.Dispatch<React.SetStateAction<EngagementState>>) {
  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem("ltv_last_visit");
  const currentStreak = parseInt(localStorage.getItem("ltv_streak") || "0", 10);
  const timers: ReturnType<typeof setTimeout>[] = [];

  if (lastVisit === today) {
    setState(s => ({ ...s, streak: currentStreak }));
    return;
  }

  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const newStreak = lastVisit === yesterday ? currentStreak + 1 : 1;
  localStorage.setItem("ltv_streak", String(newStreak));
  localStorage.setItem("ltv_last_visit", today);
  setState(s => ({ ...s, streak: newStreak }));

  if (newStreak === 7 && !localStorage.getItem("ltv_streak_7_shown")) {
    timers.push(setTimeout(() => {
      setState(s => ({ ...s, streakMilestone: "7 dias seguidos!" }));
      localStorage.setItem("ltv_streak_7_shown", "1");
    }, 800));
  }
  if (newStreak === 30 && !localStorage.getItem("ltv_streak_30_shown")) {
    timers.push(setTimeout(() => {
      setState(s => ({ ...s, streakMilestone: "30 dias seguidos! Você é top 5% dos usuários." }));
      localStorage.setItem("ltv_streak_30_shown", "1");
    }, 800));
  }

  const alreadyShown = localStorage.getItem("ltv_nps_shown");
  const signupDate = localStorage.getItem("ltv_signup_date");
  if (!alreadyShown) {
    if (!signupDate) localStorage.setItem("ltv_signup_date", String(Date.now()));
    else {
      const daysSince = Math.floor((Date.now() - Number(signupDate)) / 86_400_000);
      if (daysSince >= 30) {
        timers.push(setTimeout(() => {
          setState(s => ({ ...s, showNPS: true }));
          localStorage.setItem("ltv_nps_shown", "1");
        }, 5000));
      }
    }
  }

  const milestoneShown = localStorage.getItem("ltv_milestone_shown");
  const approved = parseInt(localStorage.getItem("ltv_prescricoes_aprovadas") || "0");
  if (!milestoneShown && approved > 0) {
    timers.push(setTimeout(() => {
      setState(s => ({ ...s, milestone: "R$ 1.000 recuperados" }));
      localStorage.setItem("ltv_milestone_shown", "1k");
    }, 1000));
  }

  // Note: timers cleanup not returned here (fallback path only runs once)
}
