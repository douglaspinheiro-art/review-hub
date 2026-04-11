/**
 * Cliente browser para envio WhatsApp via Meta Cloud API (edge `meta-whatsapp-send`).
 */
import { supabase } from "@/lib/supabase";

export interface SendTextPayload {
  number: string;
  text: string;
  delay?: number;
}

export interface SendMessageResponse {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  messageId?: string;
  status: string;
  message?: Record<string, unknown>;
}

export type ConnRow = {
  id: string;
  instance_name: string;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
  provider?: string | null;
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
  meta_api_version?: string | null;
  meta_default_template_name?: string | null;
};

type MetaProxyOk<T> = { ok: true; data: T } | { ok: false; error?: string };

function assertMetaCloud(conn: ConnRow): void {
  if (conn.provider !== "meta_cloud") {
    throw new Error("Apenas Meta Cloud API é suportada. Configure a conexão em WhatsApp.");
  }
}

async function invokeMetaWhatsAppSend<T extends SendMessageResponse>(
  connectionId: string,
  kind: "sendText" | "sendTemplate",
  fields: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<MetaProxyOk<T>>("meta-whatsapp-send", {
    body: { connectionId, kind, ...fields },
  });
  if (error) {
    throw new Error(error.message || "Falha ao chamar meta-whatsapp-send.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida do meta-whatsapp-send");
  }
  if (!("ok" in data) || !data.ok) {
    throw new Error((data as { error?: string }).error || "Meta WhatsApp retornou erro");
  }
  return (data as { ok: true; data: T }).data;
}

export async function sendTextForConnection(conn: ConnRow, payload: SendTextPayload): Promise<SendMessageResponse> {
  assertMetaCloud(conn);
  return invokeMetaWhatsAppSend<SendMessageResponse>(conn.id, "sendText", {
    number: payload.number,
    text: payload.text,
  });
}

export async function sendTemplateForConnection(
  conn: ConnRow,
  payload: {
    number: string;
    text: string;
    footer?: string;
    buttons: Array<{
      type: "url" | "call" | "reply";
      displayText: string;
      content: string;
    }>;
  },
): Promise<SendMessageResponse> {
  assertMetaCloud(conn);
  const templateName = conn.meta_default_template_name?.trim();
  if (!templateName) {
    throw new Error(
      "Conexão Meta: defina o template padrão (meta_default_template_name) ou use campanha com meta_template_name.",
    );
  }
  return invokeMetaWhatsAppSend<SendMessageResponse>(conn.id, "sendTemplate", {
    number: payload.number,
    templateName,
    templateLanguage: "pt_BR",
    templateBodyParameters: [payload.text],
  });
}

export async function sendFlowForConnection(
  _conn: ConnRow,
  _payload: {
    number: string;
    text: string;
    footer?: string;
    buttonText: string;
    flowId: string;
    screenId: string;
    data?: Record<string, unknown>;
  },
): Promise<SendMessageResponse> {
  throw new Error("Flows interativos ainda não implementados para Meta Cloud API.");
}
