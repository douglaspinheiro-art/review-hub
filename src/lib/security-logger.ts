// @ts-nocheck
import { supabase } from "@/lib/supabase";

type SecurityEventInput = {
  action: string;
  resource?: string;
  result: "success" | "failure";
  metadata?: Record<string, unknown>;
};

/**
 * Central logger for security-sensitive events.
 * Writes to the audit_logs table in production so auth failures and permission
 * denials leave a traceable audit trail.
 */
export function logSecurityEvent(event: SecurityEventInput): void {
  if (import.meta.env.DEV) {
    console.info("[security-event]", event);
  }

  // Fire-and-forget insert to audit_logs — do not await, never throw.
  supabase
    .from("audit_logs")
    .insert({
      action: event.action,
      resource_type: event.resource ?? null,
      result: event.result,
      metadata: (event.metadata ?? {}) as Record<string, unknown>,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn("[security-event] audit_logs insert failed:", error.message);
      }
    });
}
