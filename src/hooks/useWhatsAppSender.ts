
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  type ConnRow,
  sendTextForConnection,
  sendTemplateForConnection,
  sendFlowForConnection,
} from "@/lib/meta-whatsapp-client";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";

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
  const scope = useStoreScopeOptional();

  const { data: connection, isLoading } = useQuery<ConnRow | null>({
    queryKey: ["whatsapp_connection_active", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const storeId = scope?.activeStoreId ?? null;
      const effectiveUserId = scope?.effectiveUserId ?? null;
      if (!effectiveUserId) return null;
      // Do NOT select meta_access_token — credentials stay on the server (meta-whatsapp-send).
      let q = supabase
        .from("whatsapp_connections")
        .select(
          "id, instance_name, status, provider, meta_phone_number_id, meta_default_template_name, meta_api_version",
        )
        .eq("status", "connected")
        .eq("provider", "meta_cloud");
      q = storeId ? q.eq("store_id", storeId) : q.eq("user_id", effectiveUserId);
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as ConnRow | null) ?? null;
    },
    enabled: !!user && scope?.ready === true,
    staleTime: 30_000,
  });

  // hasCredentials: proxy handles the actual API keys server-side;
  // we only need to know if the connection row has enough metadata to route the call.
  const hasCredentials = !!connection && !!connection.meta_phone_number_id;

  const isReady = !isLoading && !!connection && hasCredentials;

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
    /* Meta Cloud: estado vem do webhook / painel Meta; sem polling no cliente. */
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
