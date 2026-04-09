import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  sendText as evolutionSendText,
  sendTemplate as evolutionSendTemplate,
  sendFlow,
  getConnectionState,
  mapEvolutionState,
} from "@/lib/evolution-api";
import {
  sendText as metaSendText,
  sendTemplate as metaSendTemplate,
  sendInteractiveButtons as metaSendInteractiveButtons,
} from "@/lib/meta-whatsapp-api";
import { useAuth } from "@/hooks/useAuth";

interface WhatsAppConnection {
  id: string;
  instance_name: string;
  status: string;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  api_provider: "evolution" | "meta";
  meta_phone_number_id: string | null;
  meta_waba_id: string | null;
}

interface SendResult {
  success: boolean;
  external_id?: string;
  error?: string;
}

interface ButtonPayload {
  label: string;
  url: string;
}

interface FlowPayload {
  text: string;
  buttonText: string;
  flowId: string;
  screenId: string;
}

function normalizePhone(phone: string): string {
  const normalized = phone.replace(/\D/g, "");
  return normalized.startsWith("55") ? normalized : `55${normalized}`;
}

export function useWhatsAppSender() {
  const { user } = useAuth();

  const { data: connection, isLoading } = useQuery<WhatsAppConnection | null>({
    queryKey: ["whatsapp_connection_active", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("whatsapp_connections")
        .select("id, instance_name, status, evolution_api_url, evolution_api_key, api_provider, meta_phone_number_id, meta_waba_id")
        .eq("user_id", user.id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const isReady = !isLoading && !!connection && connection.status === "connected";
  const isMeta = connection?.api_provider === "meta";

  async function sendMessage(phone: string, text: string): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }

    const e164 = normalizePhone(phone);

    try {
      if (isMeta) {
        // Meta Cloud API
        const accessToken = await getMetaAccessToken();
        if (!accessToken || !connection.meta_phone_number_id) {
          return { success: false, error: "Credenciais Meta WhatsApp não configuradas." };
        }
        const result = await metaSendText(
          { accessToken, phoneNumberId: connection.meta_phone_number_id },
          { to: e164, text }
        );
        return { success: true, external_id: result.messages?.[0]?.id };
      } else {
        // Evolution API
        if (!connection.evolution_api_url || !connection.evolution_api_key) {
          return { success: false, error: "Evolution API não configurada." };
        }
        const cfg = {
          baseUrl: connection.evolution_api_url,
          apiKey: connection.evolution_api_key,
        };
        const response = await evolutionSendText(cfg, connection.instance_name, {
          number: e164,
          text,
          delay: 1200,
        });
        const external_id = response?.key?.id ?? response?.messageId ?? undefined;
        return { success: true, external_id };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem";
      return { success: false, error: message };
    }
  }

  async function sendTemplateButton(phone: string, text: string, button: ButtonPayload): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }
    const e164 = normalizePhone(phone);
    try {
      if (isMeta) {
        // Meta doesn't support ad-hoc URL buttons; use interactive buttons instead
        const accessToken = await getMetaAccessToken();
        if (!accessToken || !connection.meta_phone_number_id) {
          return { success: false, error: "Credenciais Meta WhatsApp não configuradas." };
        }
        const result = await metaSendInteractiveButtons(
          { accessToken, phoneNumberId: connection.meta_phone_number_id },
          {
            to: e164,
            bodyText: text,
            buttons: [{ id: "btn_1", title: button.label.slice(0, 20) }],
            footerText: button.url,
          }
        );
        return { success: true, external_id: result.messages?.[0]?.id };
      } else {
        const cfg = {
          baseUrl: connection.evolution_api_url!,
          apiKey: connection.evolution_api_key!,
        };
        const response = await evolutionSendTemplate(cfg, connection.instance_name, {
          number: e164,
          text,
          buttons: [{ type: "url", displayText: button.label, content: button.url }],
        });
        const external_id = response?.key?.id ?? response?.messageId ?? undefined;
        return { success: true, external_id };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao enviar template";
      return { success: false, error: message };
    }
  }

  async function sendFlowMessage(phone: string, payload: FlowPayload): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }
    const e164 = normalizePhone(phone);
    try {
      if (isMeta) {
        // Meta Flows are a separate API — for now send as interactive
        const accessToken = await getMetaAccessToken();
        if (!accessToken || !connection.meta_phone_number_id) {
          return { success: false, error: "Credenciais Meta WhatsApp não configuradas." };
        }
        const result = await metaSendInteractiveButtons(
          { accessToken, phoneNumberId: connection.meta_phone_number_id },
          {
            to: e164,
            bodyText: payload.text,
            buttons: [{ id: payload.flowId, title: payload.buttonText.slice(0, 20) }],
          }
        );
        return { success: true, external_id: result.messages?.[0]?.id };
      } else {
        const cfg = { baseUrl: connection.evolution_api_url!, apiKey: connection.evolution_api_key! };
        const response = await sendFlow(cfg, connection.instance_name, {
          number: e164,
          text: payload.text,
          buttonText: payload.buttonText,
          flowId: payload.flowId,
          screenId: payload.screenId,
        });
        const external_id = response?.key?.id ?? response?.messageId ?? undefined;
        return { success: true, external_id };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao enviar fluxo";
      return { success: false, error: message };
    }
  }

  async function refreshConnectionStatus(): Promise<void> {
    if (!connection) return;

    if (isMeta) {
      // Meta connections are always-on; just verify the phone number is accessible
      try {
        const accessToken = await getMetaAccessToken();
        if (!accessToken || !connection.meta_phone_number_id) return;
        const { getPhoneNumberInfo } = await import("@/lib/meta-whatsapp-api");
        await getPhoneNumberInfo({ accessToken, phoneNumberId: connection.meta_phone_number_id });
        await (supabase as any)
          .from("whatsapp_connections")
          .update({ status: "connected" })
          .eq("id", connection.id);
      } catch {
        await (supabase as any)
          .from("whatsapp_connections")
          .update({ status: "error" })
          .eq("id", connection.id);
      }
      return;
    }

    // Evolution API
    try {
      const cfg = {
        baseUrl: connection.evolution_api_url!,
        apiKey: connection.evolution_api_key!,
      };
      const state = await getConnectionState(cfg, connection.instance_name);
      const mapped = mapEvolutionState(state.state);
      await supabase
        .from("whatsapp_connections")
        .update({ status: mapped })
        .eq("id", connection.id);
    } catch {
      // silent
    }
  }

  return {
    connection,
    isReady,
    isLoading,
    isMeta,
    sendMessage,
    sendTemplateButton,
    sendFlowMessage,
    refreshConnectionStatus,
  };
}

/**
 * Get the Meta WhatsApp access token from Supabase secrets (edge function proxy)
 * or from the connection's stored token.
 */
async function getMetaAccessToken(): Promise<string | null> {
  // The token is stored as a Supabase secret (META_WHATSAPP_ACCESS_TOKEN)
  // We call an edge function to proxy the request, or use the token
  // stored server-side. For client-side, we invoke an edge function.
  try {
    const { data } = await supabase.functions.invoke("meta-whatsapp-token", {
      method: "GET",
    });
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}
