import { supabase } from "@/lib/supabase";

export type MoatEventName =
  | "playbook_applied"
  | "recommendation_clicked"
  | "newsletter_sent"
  | "review_ai_generated"
  | "inbox_ai_used"
  | "ops_metadata_saved"
  | "campaign_dispatch_result"
  | "contacts_csv_export";

type MoatEventPayload = Record<string, string | number | boolean | null | undefined>;

type LocalEvent = {
  event: MoatEventName;
  at: string;
  payload: MoatEventPayload;
};

const STORAGE_KEY = "ltv_moat_event_log_v1";

function readLocalEvents(): LocalEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalEvents(events: LocalEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-400)));
  } catch {
    // ignore localStorage quota errors
  }
}

export async function trackMoatEvent(event: MoatEventName, payload: MoatEventPayload = {}) {
  const localEvent: LocalEvent = {
    event,
    at: new Date().toISOString(),
    payload,
  };

  const existing = readLocalEvents();
  writeLocalEvents([...existing, localEvent]);

  // Best effort: persist when table exists. Fail silently by design.
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;

    await (supabase as any).from("moat_events").insert({
      user_id: userId,
      event_name: event,
      payload,
      created_at: localEvent.at,
    });
  } catch {
    // optional table; keep UX resilient
  }
}

export function getMoatSignals() {
  const events = readLocalEvents();
  const last30 = events.filter((e) => Date.now() - new Date(e.at).getTime() <= 30 * 24 * 60 * 60 * 1000);
  const counts = {
    total: last30.length,
    playbooks: last30.filter((e) => e.event === "playbook_applied").length,
    recommendations: last30.filter((e) => e.event === "recommendation_clicked").length,
    newsletterSends: last30.filter((e) => e.event === "newsletter_sent").length,
    aiUsage: last30.filter((e) => e.event === "review_ai_generated" || e.event === "inbox_ai_used").length,
  };
  return counts;
}
