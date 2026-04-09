/**
 * Evolution API client
 * Docs: https://doc.evolution-api.com
 *
 * Browser: por padrão as chamadas passam pela Edge Function `evolution-proxy` (CORS + ApiKey no servidor).
 * Desative com `VITE_EVOLUTION_USE_PROXY=false` apenas se a Evolution estiver com CORS aberto para seu domínio.
 */
import { supabase } from "@/lib/supabase";

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
  /** Formato internacional, ex.: 5511999999999 */
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

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash?: { apikey: string };
  qrcode?: { code: string; base64: string };
}

/** true = usa supabase.functions.invoke("evolution-proxy") no browser */
export const EVOLUTION_USE_PROXY = import.meta.env.VITE_EVOLUTION_USE_PROXY !== "false";

export type ConnRow = {
  id: string;
  instance_name: string;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  /** evolution | meta_cloud — default evolution */
  provider?: string | null;
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
  meta_api_version?: string | null;
  meta_default_template_name?: string | null;
};

type ProxyOk<T> = { ok: true; data: T } | { ok: false; error?: string; status?: number };

function trimBase(url: string): string {
  return url.replace(/\/$/, "");
}

function buildHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
  };
}

async function invokeEvolutionProxy<T>(connectionId: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<ProxyOk<T>>("evolution-proxy", {
    body: { connectionId, action, payload },
  });
  if (error) {
    throw new Error(error.message || "Falha ao chamar evolution-proxy. Faça deploy da função ou use VITE_EVOLUTION_USE_PROXY=false.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida do evolution-proxy");
  }
  if (!("ok" in data) || !data.ok) {
    throw new Error((data as { error?: string }).error || "Evolution API retornou erro");
  }
  return (data as { ok: true; data: T }).data;
}

type MetaProxyOk<T> = { ok: true; data: T } | { ok: false; error?: string };

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

function configOrThrow(conn: ConnRow): EvolutionConfig {
  if (!conn.evolution_api_url || !conn.evolution_api_key) {
    throw new Error("Evolution API não configurada para esta conexão");
  }
  return { baseUrl: conn.evolution_api_url, apiKey: conn.evolution_api_key };
}

/** Extrai QR ou mensagens claras para count:0 / instância já aberta */
export function parseQRResponse(raw: unknown): QRCodeResponse {
  if (!raw || typeof raw !== "object") throw new Error("Resposta inválida da Evolution API");
  const o = raw as Record<string, unknown>;

  if (o.instance && typeof o.instance === "object") {
    const inst = o.instance as Record<string, unknown>;
    if (inst.state === "open") {
      throw new Error("Instância já está conectada. Atualize o status no painel.");
    }
  }

  let base64 = "";
  if (typeof o.base64 === "string") base64 = o.base64;
  else if (o.qrcode && typeof o.qrcode === "object") {
    const q = o.qrcode as Record<string, unknown>;
    if (typeof q.base64 === "string") base64 = q.base64;
  }

  if (!base64 && o.count === 0) {
    throw new Error("QR Code ainda não disponível. Aguarde alguns segundos e tente novamente.");
  }

  if (!base64) {
    throw new Error("QR Code não retornado. Confira se a instância existe na Evolution (criação + servidor).");
  }

  const code =
    typeof o.code === "string"
      ? o.code
      : typeof o.pairingCode === "string"
        ? o.pairingCode
        : "";
  return { base64, code };
}

function normalizeStateString(s: string): ConnectionState["state"] {
  const x = s.toLowerCase();
  if (x === "open") return "open";
  if (x === "connecting") return "connecting";
  return "close";
}

/** Normaliza JSON variável da Evolution (campos no root ou em `instance`) */
export function normalizeConnectionState(raw: unknown): ConnectionState {
  if (!raw || typeof raw !== "object") {
    return { instance: "", state: "close" };
  }
  const o = raw as Record<string, unknown>;
  if (o.instance && typeof o.instance === "object") {
    const inst = o.instance as Record<string, unknown>;
    const st = String(inst.state ?? "close");
    const name = String(inst.instanceName ?? "");
    return { instance: name, state: normalizeStateString(st) };
  }
  return {
    instance: String(o.instance ?? ""),
    state: normalizeStateString(String(o.state ?? "close")),
  };
}

/** Create a new instance in Evolution API */
export async function createInstance(cfg: EvolutionConfig, instanceName: string): Promise<CreateInstanceResponse> {
  const res = await fetch(`${trimBase(cfg.baseUrl)}/instance/create`, {
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

export async function createInstanceForConnection(conn: ConnRow): Promise<CreateInstanceResponse> {
  if (conn.provider === "meta_cloud") {
    throw new Error("Conexão Meta Cloud API não usa criação de instância Evolution.");
  }
  const cfg = configOrThrow(conn);
  if (EVOLUTION_USE_PROXY) {
    return invokeEvolutionProxy<CreateInstanceResponse>(conn.id, "create");
  }
  return createInstance(cfg, conn.instance_name);
}

/** Get QR code for a disconnected instance */
export async function getQRCode(cfg: EvolutionConfig, instanceName: string): Promise<QRCodeResponse> {
  const res = await fetch(`${trimBase(cfg.baseUrl)}/instance/connect/${encodeURIComponent(instanceName)}`, {
    headers: buildHeaders(cfg.apiKey),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  const raw = await res.json();
  return parseQRResponse(raw);
}

export async function getQRCodeForConnection(conn: ConnRow): Promise<QRCodeResponse> {
  if (conn.provider === "meta_cloud") {
    throw new Error("WhatsApp Meta oficial não usa QR Code nesta tela.");
  }
  if (EVOLUTION_USE_PROXY) {
    const raw = await invokeEvolutionProxy<unknown>(conn.id, "connect");
    return parseQRResponse(raw);
  }
  const cfg = configOrThrow(conn);
  return getQRCode(cfg, conn.instance_name);
}

/** Get current connection state */
export async function getConnectionState(cfg: EvolutionConfig, instanceName: string): Promise<ConnectionState> {
  const res = await fetch(`${trimBase(cfg.baseUrl)}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
    headers: buildHeaders(cfg.apiKey),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  const raw = await res.json();
  return normalizeConnectionState(raw);
}

export async function getConnectionStateForConnection(conn: ConnRow): Promise<ConnectionState> {
  if (conn.provider === "meta_cloud") {
    return { instance: conn.instance_name, state: "open" };
  }
  if (EVOLUTION_USE_PROXY) {
    const raw = await invokeEvolutionProxy<unknown>(conn.id, "connectionState");
    return normalizeConnectionState(raw);
  }
  const cfg = configOrThrow(conn);
  return getConnectionState(cfg, conn.instance_name);
}

/** Send a text message */
export async function sendText(cfg: EvolutionConfig, instanceName: string, payload: SendTextPayload): Promise<SendMessageResponse> {
  const res = await fetch(`${trimBase(cfg.baseUrl)}/message/sendText/${encodeURIComponent(instanceName)}`, {
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

export async function sendTextForConnection(conn: ConnRow, payload: SendTextPayload): Promise<SendMessageResponse> {
  if (conn.provider === "meta_cloud") {
    return invokeMetaWhatsAppSend<SendMessageResponse>(conn.id, "sendText", {
      number: payload.number,
      text: payload.text,
    });
  }
  if (EVOLUTION_USE_PROXY) {
    return invokeEvolutionProxy<SendMessageResponse>(conn.id, "messageRequest", {
      subpath: "sendText",
      body: {
        number: payload.number,
        text: payload.text,
        delay: payload.delay ?? 1200,
      },
    });
  }
  const cfg = configOrThrow(conn);
  return sendText(cfg, conn.instance_name, payload);
}

/** Send a template message with buttons (URL, Call, Reply) */
export async function sendTemplate(cfg: EvolutionConfig, instanceName: string, payload: {
  number: string;
  text: string;
  footer?: string;
  buttons: Array<{
    type: "url" | "call" | "reply";
    displayText: string;
    content: string;
  }>;
}) {
  const body = {
    number: payload.number,
    templateMessage: {
      text: payload.text,
      footer: payload.footer || "LTV Boost",
      buttons: payload.buttons.map((btn) => ({
        index: 1,
        urlButton: btn.type === "url" ? { displayText: btn.displayText, url: btn.content } : undefined,
        callButton: btn.type === "call" ? { displayText: btn.displayText, phoneNumber: btn.content } : undefined,
        quickReplyButton: btn.type === "reply" ? { displayText: btn.displayText, id: btn.content } : undefined,
      })),
    },
    delay: 1200,
  };

  const res = await fetch(`${trimBase(cfg.baseUrl)}/message/sendTemplate/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers: buildHeaders(cfg.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json() as Promise<SendMessageResponse>;
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
  const body = {
    number: payload.number,
    templateMessage: {
      text: payload.text,
      footer: payload.footer || "LTV Boost",
      buttons: payload.buttons.map((btn) => ({
        index: 1,
        urlButton: btn.type === "url" ? { displayText: btn.displayText, url: btn.content } : undefined,
        callButton: btn.type === "call" ? { displayText: btn.displayText, phoneNumber: btn.content } : undefined,
        quickReplyButton: btn.type === "reply" ? { displayText: btn.displayText, id: btn.content } : undefined,
      })),
    },
    delay: 1200,
  };

  if (conn.provider === "meta_cloud") {
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
  if (EVOLUTION_USE_PROXY) {
    return invokeEvolutionProxy<SendMessageResponse>(conn.id, "messageRequest", {
      subpath: "sendTemplate",
      body,
    });
  }
  const cfg = configOrThrow(conn);
  return sendTemplate(cfg, conn.instance_name, payload);
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
  const body = {
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
            data: payload.data || {},
          },
        },
      },
    },
    delay: 1200,
  };

  const res = await fetch(`${trimBase(cfg.baseUrl)}/message/sendTemplate/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers: buildHeaders(cfg.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
  return res.json();
}

export async function sendFlowForConnection(
  conn: ConnRow,
  payload: {
    number: string;
    text: string;
    footer?: string;
    buttonText: string;
    flowId: string;
    screenId: string;
    data?: Record<string, unknown>;
  },
): Promise<SendMessageResponse> {
  if (conn.provider === "meta_cloud") {
    throw new Error("Flows interativos ainda não implementados para Meta Cloud API.");
  }
  const body = {
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
            data: payload.data || {},
          },
        },
      },
    },
    delay: 1200,
  };

  if (EVOLUTION_USE_PROXY) {
    return invokeEvolutionProxy<SendMessageResponse>(conn.id, "messageRequest", {
      subpath: "sendTemplate",
      body,
    });
  }
  const cfg = configOrThrow(conn);
  return sendFlow(cfg, conn.instance_name, payload) as Promise<SendMessageResponse>;
}

/** Logout and delete instance */
export async function deleteInstance(cfg: EvolutionConfig, instanceName: string) {
  const res = await fetch(`${trimBase(cfg.baseUrl)}/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    headers: buildHeaders(cfg.apiKey),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Evolution API error: ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function deleteInstanceForConnection(conn: ConnRow): Promise<unknown> {
  if (conn.provider === "meta_cloud") {
    return {};
  }
  if (EVOLUTION_USE_PROXY) {
    return invokeEvolutionProxy<unknown>(conn.id, "delete");
  }
  const cfg = configOrThrow(conn);
  return deleteInstance(cfg, conn.instance_name);
}

/** Configure webhook URL for an instance (best effort by API flavor). */
export async function setWebhook(cfg: EvolutionConfig, instanceName: string, webhookUrl: string) {
  const base = trimBase(cfg.baseUrl);
  const candidates = [
    {
      url: `${base}/webhook/set/${encodeURIComponent(instanceName)}`,
      body: { webhook: { enabled: true, url: webhookUrl } },
    },
    {
      url: `${base}/webhook/setWebhook/${encodeURIComponent(instanceName)}`,
      body: { webhook: webhookUrl, enabled: true },
    },
    {
      url: `${base}/instance/webhook/${encodeURIComponent(instanceName)}`,
      body: { url: webhookUrl, enabled: true },
    },
  ];

  for (const c of candidates) {
    const res = await fetch(c.url, {
      method: "POST",
      headers: buildHeaders(cfg.apiKey),
      body: JSON.stringify(c.body),
    });
    if (res.ok) return res.json();
  }
  throw new Error("Não foi possível configurar webhook automaticamente na Evolution API.");
}

export async function setWebhookForConnection(conn: ConnRow, webhookUrl: string): Promise<unknown> {
  if (conn.provider === "meta_cloud") {
    throw new Error("Webhook Meta: configure no Facebook Developer (callback da função meta-whatsapp-webhook).");
  }
  if (EVOLUTION_USE_PROXY) {
    return invokeEvolutionProxy<unknown>(conn.id, "setWebhook", { webhookUrl });
  }
  const cfg = configOrThrow(conn);
  return setWebhook(cfg, conn.instance_name, webhookUrl);
}

/**
 * Map Evolution API state → our DB status
 */
export function mapEvolutionState(state: ConnectionState["state"]): "connected" | "connecting" | "disconnected" | "error" {
  switch (state) {
    case "open":
      return "connected";
    case "connecting":
      return "connecting";
    case "close":
      return "disconnected";
    default:
      return "error";
  }
}
