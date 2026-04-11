/**
 * WhatsApp Cloud API (Graph) — envio server-side.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const GRAPH_HOST = "https://graph.facebook.com";

export function graphMessagesUrl(apiVersion: string, phoneNumberId: string): string {
  const v = apiVersion.replace(/^v/, "v");
  return `${GRAPH_HOST}/${v}/${phoneNumberId}/messages`;
}

export async function metaGraphSendText(
  phoneNumberId: string,
  accessToken: string,
  toDigits: string,
  body: string,
  apiVersion = "v21.0",
): Promise<{ messages?: Array<{ id?: string }> }> {
  const to = toDigits.replace(/\D/g, "");
  const res = await fetch(graphMessagesUrl(apiVersion, phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta Graph error ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as { messages?: Array<{ id?: string }> };
}

export async function metaGraphSendTemplate(
  phoneNumberId: string,
  accessToken: string,
  toDigits: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
  apiVersion = "v21.0",
): Promise<{ messages?: Array<{ id?: string }> }> {
  const to = toDigits.replace(/\D/g, "");
  const components =
    bodyParameters.length > 0
      ? [
        {
          type: "body",
          parameters: bodyParameters.map((t) => ({ type: "text", text: t })),
        },
      ]
      : [];
  const res = await fetch(graphMessagesUrl(apiVersion, phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta Graph template error ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as { messages?: Array<{ id?: string }> };
}

/** GET phone number metadata — valida token + phone number ID (sem enviar mensagem). */
export async function metaGraphFetchPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  apiVersion = "v21.0",
): Promise<{
  verified_name?: string;
  display_phone_number?: string;
  quality_rating?: string;
  id?: string;
}> {
  const v = apiVersion.replace(/^v/, "v");
  const url =
    `${GRAPH_HOST}/${v}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta Graph phone error ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as {
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
    id?: string;
  };
}

export async function metaGraphSendImageLink(
  phoneNumberId: string,
  accessToken: string,
  toDigits: string,
  imageUrl: string,
  caption?: string,
  apiVersion = "v21.0",
): Promise<{ messages?: Array<{ id?: string }> }> {
  const to = toDigits.replace(/\D/g, "");
  const res = await fetch(graphMessagesUrl(apiVersion, phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: {
        link: imageUrl,
        ...(caption?.trim() ? { caption: caption.trim() } : {}),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Meta Graph image error ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as { messages?: Array<{ id?: string }> };
}
