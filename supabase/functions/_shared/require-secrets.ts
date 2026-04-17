/**
 * Boot-time validator for required Edge Function secrets.
 *
 * Usage at the top of an Edge Function handler:
 *
 *   import { requireSecrets } from "../_shared/require-secrets.ts";
 *   const secretsCheck = requireSecrets(["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"], "stripe-webhook");
 *   if (secretsCheck) return secretsCheck; // 503 with structured error
 *
 * Logs a `CRON_ALERT`-tagged JSON line so observability can detect missing
 * secrets in production without leaking the values themselves.
 */

import { corsHeaders } from "./edge-utils.ts";

export function requireSecrets(names: string[], component: string): Response | null {
  const missing = names.filter((n) => {
    const v = Deno.env.get(n);
    return !v || v.trim().length === 0;
  });

  if (missing.length === 0) return null;

  // Structured log so it can be alerted on.
  console.error(
    JSON.stringify({
      tag: "CRON_ALERT",
      ts: new Date().toISOString(),
      component,
      error: "missing_required_secrets",
      missing,
    }),
  );

  return new Response(
    JSON.stringify({
      error: "Service unavailable: missing required configuration",
      component,
      missing,
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
