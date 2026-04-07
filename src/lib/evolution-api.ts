/**
 * Evolution API client
 * Docs: https://doc.evolution-api.com
 *
 * Usage: configure the base URL + API key in Configurações → WhatsApp API,
 * then call these helpers from server-side functions or Supabase Edge Functions.
 * On the frontend we use this only for reading QR codes and connection status.
 */

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
}

export interface QRCodeResponse {
  base64: string;
  code: string;
}

export interface ConnectionState {
  instance: string;
  state: "open" | "connecting" | "close";
}

export interface SendTextPayload {
  number: string; // international format: 5511999999999
  text: string;
  delay?: number; // ms delay between messages (anti-spam)
}

export interface SendMessageResponse {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  messageId?: string; // some versions return this instead
  status: string;
  message?: Record<string, unknown>;
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash?: { apikey: string };
  qrcode?: { code: string; base64: string };
}

function buildHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
  };
}

/** Create a new instance in Evolution API */
export async function createInstance(cfg: EvolutionConfig, instanceName: string): Promise<CreateInstanceResponse> {
  const res = await fetch(`${cfg.baseUrl}/instance/create`, {
    method: "POST",
    headers: buildHeaders(cfg.apiKey),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

/** Get QR code for a disconnected instance */
export async function getQRCode(cfg: EvolutionConfig, instanceName: string): Promise<QRCodeResponse> {
  const res = await fetch(`${cfg.baseUrl}/instance/connect/${instanceName}`, {
    headers: buildHeaders(cfg.apiKey),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

/** Get current connection state */
export async function getConnectionState(cfg: EvolutionConfig, instanceName: string): Promise<ConnectionState> {
  const res = await fetch(`${cfg.baseUrl}/instance/connectionState/${instanceName}`, {
    headers: buildHeaders(cfg.apiKey),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

/** Send a text message */
export async function sendText(cfg: EvolutionConfig, instanceName: string, payload: SendTextPayload): Promise<SendMessageResponse> {
  const res = await fetch(`${cfg.baseUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: buildHeaders(cfg.apiKey),
    body: JSON.stringify({
      number: payload.number,
      text: payload.text,
      delay: payload.delay ?? 1200,
    }),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

/** Send a template message with buttons (URL, Call, Reply) */
export async function sendTemplate(cfg: EvolutionConfig, instanceName: string, payload: {
  number: string;
  text: string;
  footer?: string;
  buttons: Array<{
    type: "url" | "call" | "reply";
    displayText: string;
    content: string; // URL, Phone number or Reply ID
  }>;
}) {
  const res = await fetch(`${cfg.baseUrl}/message/sendTemplate/${instanceName}`, {
    method: "POST",
    headers: buildHeaders(cfg.apiKey),
    body: JSON.stringify({
      number: payload.number,
      templateMessage: {
        text: payload.text,
        footer: payload.footer || "LTV Boost",
        buttons: payload.buttons.map(btn => ({
          index: 1,
          urlButton: btn.type === "url" ? { displayText: btn.displayText, url: btn.content } : undefined,
          callButton: btn.type === "call" ? { displayText: btn.displayText, phoneNumber: btn.content } : undefined,
          quickReplyButton: btn.type === "reply" ? { displayText: btn.displayText, id: btn.content } : undefined,
        })),
      },
      delay: 1200,
    }),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json() as Promise<SendMessageResponse>;
}

/** Send a WhatsApp Flow (interactiveMessage) */
export async function sendFlow(cfg: EvolutionConfig, instanceName: string, payload: {
  number: string;
  text: string;
  footer?: string;
  buttonText: string;
  flowId: string;
  screenId: string;
  data?: Record<string, unknown>;
}) {
  const res = await fetch(`${cfg.baseUrl}/message/sendTemplate/${instanceName}`, {
    method: "POST",
    headers: buildHeaders(cfg.apiKey),
    body: JSON.stringify({
      number: payload.number,
      interactiveMessage: {
        header: { title: "" },
        body: { text: payload.text },
        footer: { text: payload.footer || "LTV Boost" },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: `token_${Date.now()}`,
            flow_id: payload.flowId,
            flow_cta: payload.buttonText,
            flow_action: "navigate",
            flow_action_payload: {
              screen: payload.screenId,
              data: payload.data || {}
            }
          }
        }
      },
      delay: 1200,
    }),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

/** Logout and delete instance */
export async function deleteInstance(cfg: EvolutionConfig, instanceName: string) {
  const res = await fetch(`${cfg.baseUrl}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers: buildHeaders(cfg.apiKey),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

/**
 * Map Evolution API state → our DB status
 */
export function mapEvolutionState(state: ConnectionState["state"]): "connected" | "connecting" | "disconnected" | "error" {
  switch (state) {
    case "open": return "connected";
    case "connecting": return "connecting";
    case "close": return "disconnected";
    default: return "error";
  }
}
