/**
 * Meta WhatsApp Cloud API client
 * Official API: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * This client calls the Graph API v21.0 to send messages via the
 * officially supported WhatsApp Business Platform.
 */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
}

export interface MetaSendTextPayload {
  to: string; // E.164 without '+' e.g. 5511999999999
  text: string;
}

export interface MetaSendTemplatePayload {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<Record<string, unknown>>;
}

export interface MetaSendResult {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MetaMessageStatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

// --- Helpers ---

function buildHeaders(accessToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// --- API Calls ---

/** Send a plain text message */
export async function sendText(
  cfg: MetaWhatsAppConfig,
  payload: MetaSendTextPayload
): Promise<MetaSendResult> {
  const to = normalizePhone(payload.to);
  const res = await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: buildHeaders(cfg.accessToken),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: payload.text },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Meta WhatsApp API error ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }
  return res.json();
}

/** Send a pre-approved template message */
export async function sendTemplate(
  cfg: MetaWhatsAppConfig,
  payload: MetaSendTemplatePayload
): Promise<MetaSendResult> {
  const to = normalizePhone(payload.to);
  const res = await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: buildHeaders(cfg.accessToken),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: payload.templateName,
        language: { code: payload.languageCode ?? "pt_BR" },
        components: payload.components ?? [],
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Meta WhatsApp API error ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }
  return res.json();
}

/** Send an interactive message with buttons */
export async function sendInteractiveButtons(
  cfg: MetaWhatsAppConfig,
  payload: {
    to: string;
    bodyText: string;
    buttons: Array<{ id: string; title: string }>;
    headerText?: string;
    footerText?: string;
  }
): Promise<MetaSendResult> {
  const to = normalizePhone(payload.to);
  const res = await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: buildHeaders(cfg.accessToken),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        ...(payload.headerText
          ? { header: { type: "text", text: payload.headerText } }
          : {}),
        body: { text: payload.bodyText },
        ...(payload.footerText ? { footer: { text: payload.footerText } } : {}),
        action: {
          buttons: payload.buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Meta WhatsApp API error ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }
  return res.json();
}

/** Mark a message as read */
export async function markAsRead(
  cfg: MetaWhatsAppConfig,
  messageId: string
): Promise<void> {
  await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: buildHeaders(cfg.accessToken),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

/** Get WhatsApp Business phone number info (verifies connection) */
export async function getPhoneNumberInfo(
  cfg: MetaWhatsAppConfig
): Promise<{
  verified_name: string;
  display_phone_number: string;
  quality_rating: string;
  id: string;
}> {
  const res = await fetch(
    `${GRAPH_BASE}/${cfg.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
    { headers: buildHeaders(cfg.accessToken) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Meta WhatsApp API error ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }
  return res.json();
}

/**
 * Map Meta webhook status to our internal status
 */
export function mapMetaStatus(
  status: string
): "sent" | "delivered" | "read" | "failed" | "unknown" {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}
