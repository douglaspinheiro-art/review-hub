/**
 * Contratos canônicos do canal WhatsApp (Meta Cloud API).
 * Cliente browser: `meta-whatsapp-client.ts`; envio servidor: `meta-graph-send` nas edge functions.
 */

export const WHATSAPP_PROVIDERS = ["meta_cloud"] as const;
export type WhatsappProviderId = (typeof WHATSAPP_PROVIDERS)[number];

export type CanonicalSendText = {
  number: string;
  text: string;
  delayMs?: number;
};
