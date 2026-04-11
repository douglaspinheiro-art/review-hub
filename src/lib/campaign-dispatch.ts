/** Resposta esperada da edge `dispatch-campaign` (campos usados na UI). */
export type DispatchCampaignResponse = {
  sent: number;
  failed: number;
  partial?: boolean;
  remaining?: number;
  dispatch_reason?: string;
  message?: string;
};
