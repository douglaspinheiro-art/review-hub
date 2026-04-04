export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          company_name: string | null;
          plan: "starter" | "growth" | "scale" | "enterprise";
          trial_ends_at: string | null;
          onboarding_completed: boolean;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      whatsapp_connections: {
        Row: {
          id: string;
          user_id: string;
          instance_name: string;
          phone_number: string | null;
          status: "disconnected" | "connecting" | "connected" | "error";
          evolution_api_url: string | null;
          evolution_api_key: string | null;
          webhook_url: string | null;
          connected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["whatsapp_connections"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["whatsapp_connections"]["Insert"]>;
      };
      contacts: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          phone: string;
          email: string | null;
          tags: string[] | null;
          status: "active" | "inactive" | "blocked";
          notes: string | null;
          total_orders: number;
          total_spent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["contacts"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
      };
      conversations: {
        Row: {
          id: string;
          contact_id: string;
          status: "open" | "closed" | "pending";
          assigned_to: string | null;
          last_message: string | null;
          last_message_at: string | null;
          unread_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["conversations"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          content: string;
          direction: "inbound" | "outbound";
          status: "sent" | "delivered" | "read" | "failed";
          type: "text" | "image" | "audio" | "document" | "template";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
      campaigns: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          message: string;
          channel: "whatsapp" | "email" | "sms";
          subject: string | null;
          status: "draft" | "scheduled" | "running" | "completed" | "paused" | "failed";
          tags: string[] | null;
          scheduled_at: string | null;
          sent_count: number;
          delivered_count: number;
          read_count: number;
          reply_count: number;
          total_contacts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["campaigns"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
      };
      campaign_segments: {
        Row: {
          id: string;
          campaign_id: string;
          type: "all" | "tag" | "status" | "rfm" | "custom";
          filters: Json;
          estimated_reach: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["campaign_segments"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["campaign_segments"]["Insert"]>;
      };
      abandoned_carts: {
        Row: {
          id: string;
          user_id: string | null;
          source: "shopify" | "nuvemshop" | "tray" | "vtex" | "woocommerce" | "custom";
          external_id: string | null;
          customer_name: string | null;
          customer_phone: string;
          customer_email: string | null;
          cart_value: number;
          cart_items: Json;
          recovery_url: string | null;
          status: "pending" | "message_sent" | "recovered" | "expired";
          message_sent_at: string | null;
          recovered_at: string | null;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["abandoned_carts"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["abandoned_carts"]["Insert"]>;
      };
      analytics_daily: {
        Row: {
          id: string;
          date: string;
          messages_sent: number;
          messages_delivered: number;
          messages_read: number;
          new_contacts: number;
          active_conversations: number;
          revenue_influenced: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["analytics_daily"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["analytics_daily"]["Insert"]>;
      };
      lojas: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          plataforma: "shopify" | "nuvemshop" | "woocommerce" | "vtex" | "tray" | "outro" | null;
          url: string | null;
          segmento: string | null;
          ticket_medio: number | null;
          ga4_property_id: string | null;
          ga4_access_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["lojas"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["lojas"]["Insert"]>;
      };
      metricas_funil: {
        Row: {
          id: string;
          user_id: string;
          loja_id: string;
          data: string;
          visitantes: number;
          visualizacoes_produto: number;
          adicionou_carrinho: number;
          iniciou_checkout: number;
          compras: number;
          receita: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["metricas_funil"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["metricas_funil"]["Insert"]>;
      };
      diagnosticos: {
        Row: {
          id: string;
          user_id: string;
          loja_id: string | null;
          status: "pending" | "processing" | "done" | "error";
          score: number | null;
          taxa_conversao: number | null;
          meta_conversao: number;
          resumo: string | null;
          recomendacoes: Recomendacao[] | null;
          dados_funil: Record<string, number> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["diagnosticos"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["diagnosticos"]["Insert"]>;
      };
      configuracoes_convertiq: {
        Row: {
          id: string;
          user_id: string;
          meta_conversao: number;
          alertas_ativos: boolean;
          integracao_ga4: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["configuracoes_convertiq"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["configuracoes_convertiq"]["Insert"]>;
      };
    };
  };
}

export type Recomendacao = {
  prioridade: "alta" | "media" | "baixa";
  titulo: string;
  descricao: string;
  impacto_estimado: string;
  categoria: string;
};
