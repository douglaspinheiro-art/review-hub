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

export async function markStepUpVerified(userId: string): Promise<void> {
  const verifiedUntil = Date.now() + STEPUP_TTL_MS;

  // Persist to server FIRST — server is the authoritative source.
  const { error } = await supabase
    .from("security_stepup_sessions")
    .upsert(
      {
        user_id: userId,
        verified_at: new Date().toISOString(),
        expires_at: new Date(verifiedUntil).toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    // Do not mark as verified locally if the server failed to persist.
    throw new Error(`Failed to persist step-up session: ${error.code}`);
  }

  // Write to localStorage only after server confirms — acts as a cache only.
  writeLocalStepUp({ userId, verifiedUntil });
}

export async function hasValidStepUp(userId: string): Promise<boolean> {
  // localStorage acts as an early-exit ONLY for sessions that are already
  // expired locally. It is NOT used to grant access — the server is authoritative.
  const local = readLocalStepUp();
  if (local?.userId === userId && local.verifiedUntil <= Date.now()) {
    // Locally expired — no need to hit the server, definitely false.
    clearLocalStepUp();
    return false;
  }

  // Always verify against the server. localStorage cannot be trusted as the
  // sole source of truth for security-sensitive access control decisions —
  // it is trivially manipulable via DevTools.
  const { data } = await supabase
    .from("security_stepup_sessions")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.expires_at) return false;
  const expiresAt = new Date(data.expires_at).getTime();
  const isValid = !Number.isNaN(expiresAt) && expiresAt > Date.now();

  if (isValid) {
    // Update local cache with server-authoritative expiry
    writeLocalStepUp({ userId, verifiedUntil: expiresAt });
  } else {
    clearLocalStepUp();
  }
  return isValid;
}
