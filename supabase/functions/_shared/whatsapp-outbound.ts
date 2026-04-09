import { evolutionSendText } from "./whatsapp-evolution-send.ts";
import { metaGraphSendText, metaGraphSendTemplate } from "./meta-graph-send.ts";

export type WaConnectionOutbound = {
  provider: string;
  instance_name: string;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  meta_phone_number_id: string | null;
  meta_access_token: string | null;
  meta_api_version: string | null;
};

function toUnifiedResult(v: { messages?: Array<{ id?: string }> } | null): {
  key?: { id?: string };
  messageId?: string;
} | null {
  const id = v?.messages?.[0]?.id;
  if (!id) return v as any;
  return { messageId: id, key: { id } };
}

/** Envio de texto — Evolution ou Meta conforme provider. */
export async function outboundSendText(
  conn: WaConnectionOutbound,
  numberDigits: string,
  text: string,
  delayMs?: number,
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  const p = conn.provider ?? "evolution";
  if (p === "meta_cloud") {
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
  if (!conn.evolution_api_url?.trim() || !conn.evolution_api_key?.trim()) {
    throw new Error("Evolution: URL ou ApiKey ausente");
  }
  return evolutionSendText(
    conn.evolution_api_url,
    conn.evolution_api_key,
    conn.instance_name,
    numberDigits,
    text,
    delayMs,
  );
}

/** Template aprovado Meta (fora da janela de 24h ou campanhas). */
export async function outboundSendMetaTemplate(
  conn: WaConnectionOutbound,
  numberDigits: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): Promise<{ key?: { id?: string }; messageId?: string } | null> {
  if ((conn.provider ?? "evolution") !== "meta_cloud") {
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
