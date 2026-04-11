export type DispatchNewsletterResult = {
  sent: number;
  failed: number;
  total?: number;
  scheduled?: boolean;
  /** Resposta da edge após enfileirar envio em massa (process-scheduled-messages). */
  queued?: boolean;
};

/**
 * Interpreta JSON de `dispatch-newsletter` e envio agendado só no cliente.
 * A edge devolve `queued` + `total` no disparo real; teste devolve `sent`.
 */
export function parseDispatchNewsletterResponse(data: unknown): DispatchNewsletterResult {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string") {
      const rid = typeof d.request_id === "string" ? ` Ref: ${d.request_id}` : "";
      throw new Error(`${d.error}${rid}`.trim());
    }
    if (d.scheduled === true) return { sent: 0, failed: 0, scheduled: true };
    if (d.queued === true || (d.success === true && typeof d.total === "number")) {
      return {
        sent: 0,
        failed: 0,
        total: typeof d.total === "number" ? d.total : undefined,
        scheduled: false,
        queued: true,
      };
    }
    if (typeof d.sent === "number") {
      return {
        sent: d.sent,
        failed: typeof d.failed === "number" ? d.failed : 0,
        total: typeof d.total === "number" ? d.total : undefined,
        scheduled: false,
      };
    }
  }
  throw new Error("Resposta inválida do servidor ao enviar newsletter.");
}
