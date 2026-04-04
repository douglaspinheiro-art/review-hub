import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { sendText, getConnectionState, mapEvolutionState } from "@/lib/evolution-api";
import { useAuth } from "@/hooks/useAuth";

interface WhatsAppConnection {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
  evolution_api_url: string;
  evolution_api_key: string;
}

interface SendResult {
  success: boolean;
  external_id?: string;
  error?: string;
}

export function useWhatsAppSender() {
  const { user } = useAuth();

  const { data: connection, isLoading } = useQuery<WhatsAppConnection | null>({
    queryKey: ["whatsapp_connection_active", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("whatsapp_connections")
        .select("id, instance_name, phone_number, status, evolution_api_url, evolution_api_key")
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

  async function sendMessage(phone: string, text: string): Promise<SendResult> {
    if (!connection) {
      return { success: false, error: "Nenhuma conexão WhatsApp ativa. Configure em Configurações." };
    }

    // Normalize phone: strip non-digits, ensure starts with 55
    const normalized = phone.replace(/\D/g, "");
    const e164 = normalized.startsWith("55") ? normalized : `55${normalized}`;

    try {
      const cfg = {
        baseUrl: connection.evolution_api_url,
        apiKey: connection.evolution_api_key,
      };

      const response = await sendText(cfg, connection.instance_name, {
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

  async function refreshConnectionStatus(): Promise<void> {
    if (!connection) return;
    try {
      const cfg = {
        baseUrl: connection.evolution_api_url,
        apiKey: connection.evolution_api_key,
      };
      const state = await getConnectionState(cfg, connection.instance_name);
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
    refreshConnectionStatus,
  };
}
