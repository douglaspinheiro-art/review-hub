type SecurityEventInput = {
  action: string;
  resource?: string;
  result: "success" | "failure";
  metadata?: Record<string, unknown>;
};

/**
 * Central logger for security-sensitive events.
 * Keep side effects lightweight on client; backend ingestion can be added later.
 */
export function logSecurityEvent(event: SecurityEventInput) {
  if (import.meta.env.DEV) {
    // Useful during development without introducing noisy production logs.
    console.info("[security-event]", event);
  }
}
