/**
 * Envio HTTP direto para Evolution API (Edge / Deno).
 * Mantém o mesmo contrato usado por dispatch-campaign.
 */

export const DEFAULT_EVOLUTION_DELAY_MS = 1200;

export async function evolutionSendText(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string,
  delayMs = DEFAULT_EVOLUTION_DELAY_MS,
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number, text, delay: delayMs }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function evolutionSendMedia(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "audio" | "document",
  caption?: string,
  delayMs = DEFAULT_EVOLUTION_DELAY_MS,
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption ?? "",
      delay: delayMs,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API media error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function evolutionSendTemplateButtons(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string,
  buttons: Array<{ type: "url" | "call" | "reply"; label: string; value: string }>,
  delayMs = DEFAULT_EVOLUTION_DELAY_MS,
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/message/sendTemplate/${encodeURIComponent(instanceName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number,
      templateMessage: {
        text,
        footer: "LTV Boost",
        buttons: buttons.slice(0, 3).map((btn, idx) => ({
          index: idx + 1,
          urlButton: btn.type === "url" ? { displayText: btn.label, url: btn.value } : undefined,
          callButton: btn.type === "call" ? { displayText: btn.label, phoneNumber: btn.value } : undefined,
          quickReplyButton: btn.type === "reply" ? { displayText: btn.label, id: btn.value } : undefined,
        })),
      },
      delay: delayMs,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API template error ${res.status}: ${body}`);
  }
  return res.json();
}
