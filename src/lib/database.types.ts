export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          company_name: string | null;
          avatar_url: string | null;
          plan: "starter" | "growth" | "scale" | "enterprise";
          role: "user" | "admin";
          trial_ends_at: string | null;
          onboarding_completed: boolean;
          ia_negotiation_enabled: boolean | null;
          ia_max_discount_pct: number | null;
          social_proof_enabled: boolean | null;
          pix_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      stores: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          segment: string | null;
          plataforma: string | null;
          url: string | null;
          ticket_medio: number | null;
          ga4_property_id: string | null;
          ga4_access_token: string | null;
          pix_key: string | null;
          conversion_health_score: number;
          chs_history: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["stores"]["Row"], "id" | "created_at" | "updated_at" | "conversion_health_score" | "chs_history"> & { id?: string };
        Update: Record<string, any>;
      };
      contacts: {
        Row: {
          id: string;
          user_id: string | null;
          store_id: string | null;
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
        Insert: Omit<Database["public"]["Tables"]["contacts"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
      };
      customers_v3: {
        Row: {
          id: string;
          user_id: string;
          store_id: string | null;
          email: string | null;
          phone: string | null;
          name: string | null;
          birth_date: string | null;
          rfm_recency: number | null;
          rfm_frequency: number | null;
          rfm_monetary: number | null;
          rfm_segment: string | null;
          behavioral_profile: string | null;
          preferred_channel: string | null;
          last_purchase_at: string | null;
          churn_score: number;
          customer_health_score: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["customers_v3"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["customers_v3"]["Insert"]>;
      };
      conversations: {
        Row: {
          id: string;
          user_id: string | null;
          store_id: string | null;
          contact_id: string;
          status: "open" | "closed" | "pending";
          assigned_to: string | null;
          last_message: string | null;
          last_message_at: string | null;
          unread_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["conversations"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
      };
      messages: {
        Row: {
          id: string;
          user_id: string | null;
          conversation_id: string;
          content: string;
          direction: "inbound" | "outbound";
          status: "sent" | "delivered" | "read" | "failed";
          type: "text" | "image" | "audio" | "document" | "template";
          external_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      campaigns: {
        Row: {
          id: string;
          user_id: string | null;
          store_id: string | null;
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
        Insert: Omit<Database["public"]["Tables"]["campaigns"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
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
        Insert: Omit<Database["public"]["Tables"]["campaign_segments"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      abandoned_carts: {
        Row: {
          id: string;
          user_id: string | null;
          store_id: string | null;
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
          campaign_id: string | null;
          automation_id: string | null;
          value: number | null;
          shipping_value: number | null;
          payment_failure_reason: string | null;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["abandoned_carts"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
      };
      analytics_daily: {
        Row: {
          id: string;
          user_id: string | null;
          store_id: string | null;
          date: string;
          messages_sent: number;
          messages_delivered: number;
          messages_read: number;
          new_contacts: number;
          active_conversations: number;
          revenue_influenced: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["analytics_daily"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      opportunities: {
        Row: {
          id: string;
          user_id: string;
          store_id: string | null;
          type: string;
          title: string;
          description: string | null;
          root_cause: string | null;
          severity: "critico" | "alto" | "medio" | "oportunidade" | null;
          estimated_impact: number | null;
          impacto_estimado: number | null;
          status: "novo" | "snoozed" | "em_tratamento" | "resolvido" | "ignorado";
          detected_at: string;
          resolved_at: string | null;
          dados_json: Json | null;
        };
        Insert: Omit<Database["public"]["Tables"]["opportunities"]["Row"], "id" | "detected_at"> & { id?: string };
        Update: Record<string, any>;
      };
      prescriptions: {
        Row: {
          id: string;
          user_id: string;
          store_id: string | null;
          opportunity_id: string | null;
          title: string;
          description: string | null;
          execution_channel: "whatsapp" | "email" | "sms" | "multicanal" | null;
          segment_target: string | null;
          behavioral_profile_target: string | null;
          num_clients_target: number | null;
          template_json: Json | null;
          discount_value: number | null;
          discount_type: "percentual" | "frete_gratis" | "fixo" | null;
          estimated_potential: number | null;
          estimated_roi: number | null;
          status: "aguardando_aprovacao" | "aprovada" | "em_execucao" | "concluida" | "rejeitada";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["prescriptions"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      diagnostics_v3: {
        Row: {
          id: string;
          store_id: string | null;
          diagnostic_json: Json | null;
          chs: number | null;
          chs_label: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["diagnostics_v3"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["diagnostics_v3"]["Insert"]>;
      };
      whatsapp_connections: {
        Row: {
          id: string;
          user_id: string;
          store_id: string | null;
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
        Insert: Omit<Database["public"]["Tables"]["whatsapp_connections"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
      };
      system_config: {
        Row: {
          id: string;
          maintenance_active: boolean;
          maintenance_message: string | null;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      integrations: {
        Row: {
          id: string;
          store_id: string | null;
          user_id: string;
          platform: "shopify" | "nuvemshop" | "woocommerce" | "vtex" | "tray" | "ga4" | "custom";
          status: "active" | "inactive" | "error" | "pending";
          config_json: Json;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["integrations"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
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
          pix_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["lojas"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
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
        Insert: Omit<Database["public"]["Tables"]["metricas_funil"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
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
        Insert: Omit<Database["public"]["Tables"]["diagnosticos"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
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
        Insert: Omit<Database["public"]["Tables"]["configuracoes_convertiq"]["Row"], "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Record<string, any>;
      };
      automations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          trigger: "cart_abandoned" | "custom" | "customer_birthday" | "customer_inactive" | "new_contact" | "order_delivered";
          message_template: string;
          delay_minutes: number;
          is_active: boolean;
          sent_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["automations"]["Row"], "id" | "created_at" | "updated_at" | "sent_count"> & { id?: string; sent_count?: number };
        Update: Record<string, any>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          action_url: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      nps_responses: {
        Row: {
          id: string;
          user_id: string | null;
          score: number;
          comment: string | null;
          responded_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["nps_responses"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      cs_alerts: {
        Row: {
          id: string;
          user_id: string | null;
          type: string;
          score: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["cs_alerts"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          key_preview: string;
          environment: "production" | "sandbox";
          scopes: string[];
          last_used_at: string | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["api_keys"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      agente_ia_config: {
        Row: {
          id: string;
          user_id: string;
          loja_id: string;
          ativo: boolean;
          modo: string;
          personalidade_preset: string;
          prompt_sistema: string;
          conhecimento_loja: string;
          tom_de_voz: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      attribution_events: {
        Row: {
          id: string;
          user_id: string;
          order_id: string | null;
          order_value: number;
          order_date: string | null;
          customer_phone: string | null;
          source_platform: string | null;
          attributed_message_id: string | null;
          attributed_campaign_id: string | null;
          attributed_automation_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["attribution_events"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      webhook_logs: {
        Row: {
          id: string;
          plataforma: string | null;
          loja_id: string | null;
          payload_bruto: Json | null;
          status_processamento: string | null;
          erro_mensagem: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["webhook_logs"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Record<string, any>;
      };
      products_v3: {
        Row: {
          id: string;
          store_id: string;
          user_id: string;
          name: string;
          sku: string | null;
          price: number | null;
          stock: number | null;
          category: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["products_v3"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["products_v3"]["Insert"]>;
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
