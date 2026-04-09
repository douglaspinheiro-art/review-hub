import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  type ConnRow,
  sendTextForConnection,
  sendTemplateForConnection,
  sendFlowForConnection,
  getConnectionStateForConnection,
  mapEvolutionState,
} from "@/lib/evolution-api";
import { useAuth } from "@/hooks/useAuth";

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

export function useWhatsAppSender() {
  const { user } = useAuth();

  const { data: connection, isLoading } = useQuery<ConnRow | null>({
    queryKey: ["whatsapp_connection_active", user?.id],
    queryFn: async () => {
      if (!user) return null;
      // Do NOT select evolution_api_key or meta_access_token — credentials must
      // stay on the server and be accessed only through the edge function proxies
      // (evolution-proxy / meta-whatsapp-send).
      const { data } = await supabase
        .from("whatsapp_connections")
        .select(
          "id, instance_name, status, evolution_api_url, provider, meta_phone_number_id, meta_default_template_name, meta_api_version",
        )
        .eq("user_id", user.id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      return (data as ConnRow | null) ?? null;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // hasCredentials: proxy handles the actual API keys server-side;
  // we only need to know if the connection row has enough metadata to route the call.
  const hasCredentials =
    !!connection &&
    (connection.provider === "meta_cloud"
      ? !!connection.meta_phone_number_id
      : !!connection.evolution_api_url);

  const isReady = !isLoading && !!connection && connection.status === "connected" && hasCredentials;

  async function sendMessage(phone: string, text: string): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }

    // Normalize phone: strip non-digits, ensure starts with 55
    const normalized = phone.replace(/\D/g, "");
    const e164 = normalized.startsWith("55") ? normalized : `55${normalized}`;

    try {
      const response = await sendTextForConnection(connection, {
        number: e164,
        text,
        delay: 1200,
      });

      // Evolution API returns the message key with id
      const external_id = response?.key?.id ?? response?.messageId ?? undefined;
      return { success: true, external_id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem";
      return { success: false, error: message };
    }
  }

  async function sendTemplateButton(phone: string, text: string, button: ButtonPayload): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }
    const normalized = phone.replace(/\D/g, "");
    const e164 = normalized.startsWith("55") ? normalized : `55${normalized}`;
    try {
      const response = await sendTemplateForConnection(connection, {
        number: e164,
        text,
        buttons: [{ type: "url", displayText: button.label, content: button.url }],
      });
      const external_id = response?.key?.id ?? response?.messageId ?? undefined;
      return { success: true, external_id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao enviar template";
      return { success: false, error: message };
    }
  }

  async function sendFlowMessage(phone: string, payload: FlowPayload): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }
    const normalized = phone.replace(/\D/g, "");
    const e164 = normalized.startsWith("55") ? normalized : `55${normalized}`;
    try {
      const response = await sendFlowForConnection(connection, {
        number: e164,
        text: payload.text,
        buttonText: payload.buttonText,
        flowId: payload.flowId,
        screenId: payload.screenId,
      });
      const external_id = response?.key?.id ?? response?.messageId ?? undefined;
      return { success: true, external_id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao enviar fluxo";
      return { success: false, error: message };
    }
  }

  async function refreshConnectionStatus(): Promise<void> {
    if (!connection || connection.provider === "meta_cloud") return;
    try {
      const state = await getConnectionStateForConnection(connection);
      const mapped = mapEvolutionState(state.state);
      await supabase
        .from("whatsapp_connections")
        .update({ status: mapped })
        .eq("id", connection.id);
    } catch {
      // silent — connection may be temporarily unreachable
    }
  }

  return {
    connection,
    isReady,
    isLoading,
    sendMessage,
    sendTemplateButton,
    sendFlowMessage,
    refreshConnectionStatus,
  };
}
