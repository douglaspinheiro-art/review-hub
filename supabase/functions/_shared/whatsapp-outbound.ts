import { metaGraphSendText, metaGraphSendTemplate } from "./meta-graph-send.ts";

export type WaConnectionOutbound = {
  provider: string;
  instance_name: string;
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_api_version: string | null;
};

function toUnifiedResult(v: { messages?: Array<{ id?: string }> } | null): {
  key?: { id?: string };
  messageId?: string;
} | null {
  const id = v?.messages?.[0]?.id;
  if (!id) return null;
  return { messageId: id, key: { id } };
}

/** Envio de texto — Meta Cloud API. */
export async function outboundSendText(
  conn: WaConnectionOutbound,
  numberDigits: string,
  text: string,
  _delayMs?: number,
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  if ((conn.provider ?? "meta_cloud") !== "meta_cloud") {
    throw new Error("Apenas Meta Cloud API é suportada.");
  }
  if (!conn.meta_phone_number_id?.trim() || !conn.meta_access_token?.trim()) {
    throw new Error("Meta Cloud: phone_number_id ou access_token ausente");
  }
  const raw = await metaGraphSendText(
    conn.meta_phone_number_id,
    conn.meta_access_token,
    numberDigits,
    text,
    conn.meta_api_version ?? "v21.0",
  );
  return toUnifiedResult(raw);
}

/** Template aprovado Meta (fora da janela de 24h ou campanhas). */
export async function outboundSendMetaTemplate(
  conn: WaConnectionOutbound,
  numberDigits: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  if ((conn.provider ?? "meta_cloud") !== "meta_cloud") {
    throw new Error("Template Meta só para provider meta_cloud");
  }
  if (!conn.meta_phone_number_id?.trim() || !conn.meta_access_token?.trim()) {
    throw new Error("Meta Cloud: phone_number_id ou access_token ausente");
  }
  const raw = await metaGraphSendTemplate(
    conn.meta_phone_number_id,
    conn.meta_access_token,
    numberDigits,
    templateName,
    languageCode,
    bodyParameters,
    conn.meta_api_version ?? "v21.0",
  );
  return toUnifiedResult(raw);
}
