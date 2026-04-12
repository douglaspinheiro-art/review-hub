import * as Sentry from "@sentry/react";

/**
 * Inicializa o Sentry apenas quando `VITE_SENTRY_DSN` está definido (produção ou staging).
 * Sem DSN, não há custo nem bundle extra de transport em desenvolvimento local.
 */
export function initSentry(): void {
  const dsn = typeof import.meta.env.VITE_SENTRY_DSN === "string" ? import.meta.env.VITE_SENTRY_DSN.trim() : "";
  if (!dsn || !dsn.startsWith("http")) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.12 : 0,
    sendDefaultPii: false,
  });
}
