import { supabase } from "@/lib/supabase";

const LOCAL_STEPUP_KEY = "ltv_stepup_verified_until";
const STEPUP_TTL_MS = 30 * 60 * 1000;

type StepUpState = {
  userId: string;
  verifiedUntil: number;
};

function readLocalStepUp(): StepUpState | null {
  const raw = localStorage.getItem(LOCAL_STEPUP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StepUpState;
  } catch {
    return null;
  }
}

function writeLocalStepUp(state: StepUpState) {
  localStorage.setItem(LOCAL_STEPUP_KEY, JSON.stringify(state));
}

export function clearLocalStepUp() {
  localStorage.removeItem(LOCAL_STEPUP_KEY);
}

export async function markStepUpVerified(userId: string) {
  const verifiedUntil = Date.now() + STEPUP_TTL_MS;
  writeLocalStepUp({ userId, verifiedUntil });

  // Best-effort backend TTL state for server-side checks.
  await (supabase as any)
    .from("security_stepup_sessions")
    .upsert(
      {
        user_id: userId,
        verified_at: new Date().toISOString(),
        expires_at: new Date(verifiedUntil).toISOString(),
      },
      { onConflict: "user_id" },
    );
}

export async function hasValidStepUp(userId: string): Promise<boolean> {
  const local = readLocalStepUp();
  if (local?.userId === userId && local.verifiedUntil > Date.now()) {
    return true;
  }

  const { data } = await (supabase as any)
    .from("security_stepup_sessions")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.expires_at) return false;
  const expiresAt = new Date(data.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) return false;

  writeLocalStepUp({ userId, verifiedUntil: expiresAt });
  return true;
}
