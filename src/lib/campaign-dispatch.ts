/** Resposta esperada da edge `dispatch-campaign` (campos usados na UI). */
export type DispatchCampaignResponse = {
  sent: number;
  failed: number;
  partial?: boolean;
  remaining?: number;
  dispatch_reason?: string;
  message?: string;
  /** Linhas realmente inseridas na fila `scheduled_messages` (idempotente). */
  enqueued?: number;
  skipped_duplicates?: number;
  total?: number;
  duplicate_dispatch?: boolean;
};
