export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ab_tests: {
        Row: {
          created_at: string
          decide_after_hours: number
          decided_at: string | null
          id: string
          name: string
          split_pct: number
          status: string
          user_id: string
          variant_a_id: string
          variant_b_id: string
          winner_metric: string
          winner_variant: string | null
        }
        Insert: {
          created_at?: string
          decide_after_hours?: number
          decided_at?: string | null
          id?: string
          name: string
          split_pct?: number
          status?: string
          user_id: string
          variant_a_id: string
          variant_b_id: string
          winner_metric?: string
          winner_variant?: string | null
        }
        Update: {
          created_at?: string
          decide_after_hours?: number
          decided_at?: string | null
          id?: string
          name?: string
          split_pct?: number
          status?: string
          user_id?: string
          variant_a_id?: string
          variant_b_id?: string
          winner_metric?: string
          winner_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_tests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_carts: {
        Row: {
          automation_id: string | null
          campaign_id: string | null
          cart_items: Json
          cart_value: number
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string
          external_id: string | null
          id: string
          message_sent_at: string | null
          raw_payload: Json | null
          recovered_at: string | null
          recovered_value: number | null
          recovery_url: string | null
          source: string
          status: string
          store_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          automation_id?: string | null
          campaign_id?: string | null
          cart_items?: Json
          cart_value?: number
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone: string
          external_id?: string | null
          id?: string
          message_sent_at?: string | null
          raw_payload?: Json | null
          recovered_at?: string | null
          recovered_value?: number | null
          recovery_url?: string | null
          source?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          automation_id?: string | null
          campaign_id?: string | null
          cart_items?: Json
          cart_value?: number
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string
          external_id?: string | null
          id?: string
          message_sent_at?: string | null
          raw_payload?: Json | null
          recovered_at?: string | null
          recovered_value?: number | null
          recovery_url?: string | null
          source?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers_v3"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals: {
        Row: {
          commission_brl: number | null
          commission_pct: number
          converted_at: string | null
          created_at: string
          id: string
          paid_at: string | null
          plan_name: string | null
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          commission_brl?: number | null
          commission_pct?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          plan_name?: string | null
          referred_email: string
          referred_user_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          commission_brl?: number | null
          commission_pct?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          plan_name?: string | null
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_config: {
        Row: {
          ativo: boolean | null
          conhecimento_loja: string | null
          id: string
          modo: string | null
          personalidade_preset: string | null
          prompt_sistema: string
          store_id: string | null
          tom_de_voz: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          conhecimento_loja?: string | null
          id?: string
          modo?: string | null
          personalidade_preset?: string | null
          prompt_sistema: string
          store_id?: string | null
          tom_de_voz?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          conhecimento_loja?: string | null
          id?: string
          modo?: string | null
          personalidade_preset?: string | null
          prompt_sistema?: string
          store_id?: string | null
          tom_de_voz?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_generated_coupons: {
        Row: {
          code: string
          contact_id: string | null
          created_at: string | null
          discount_pct: number
          expires_at: string | null
          id: string
          store_id: string | null
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          code: string
          contact_id?: string | null
          created_at?: string | null
          discount_pct: number
          expires_at?: string | null
          id?: string
          store_id?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string
          contact_id?: string | null
          created_at?: string | null
          discount_pct?: number
          expires_at?: string | null
          id?: string
          store_id?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          active_conversations: number
          created_at: string
          date: string
          id: string
          messages_delivered: number
          messages_read: number
          messages_sent: number
          new_contacts: number
          revenue_influenced: number
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          active_conversations?: number
          created_at?: string
          date: string
          id?: string
          messages_delivered?: number
          messages_read?: number
          messages_sent?: number
          new_contacts?: number
          revenue_influenced?: number
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          active_conversations?: number
          created_at?: string
          date?: string
          id?: string
          messages_delivered?: number
          messages_read?: number
          messages_sent?: number
          new_contacts?: number
          revenue_influenced?: number
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_daily_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          environment: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          key_preview: string
          last_used_at: string | null
          name: string
          scopes: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          environment?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          key_preview: string
          last_used_at?: string | null
          name: string
          scopes?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          environment?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          key_preview?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_events: {
        Row: {
          attributed_automation_id: string | null
          attributed_campaign_id: string | null
          attributed_message_id: string | null
          cart_id: string | null
          created_at: string
          customer_phone: string
          id: string
          order_date: string
          order_id: string
          order_value: number
          source_platform: string | null
          user_id: string
        }
        Insert: {
          attributed_automation_id?: string | null
          attributed_campaign_id?: string | null
          attributed_message_id?: string | null
          cart_id?: string | null
          created_at?: string
          customer_phone: string
          id?: string
          order_date?: string
          order_id: string
          order_value?: number
          source_platform?: string | null
          user_id: string
        }
        Update: {
          attributed_automation_id?: string | null
          attributed_campaign_id?: string | null
          attributed_message_id?: string | null
          cart_id?: string | null
          created_at?: string
          customer_phone?: string
          id?: string
          order_date?: string
          order_id?: string
          order_value?: number
          source_platform?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribution_events_attributed_automation_id_fkey"
            columns: ["attributed_automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_events_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "abandoned_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string
          delay_minutes: number
          id: string
          is_active: boolean
          message_template: string
          name: string
          sent_count: number
          trigger: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          message_template: string
          name: string
          sent_count?: number
          trigger: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          sent_count?: number
          trigger?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_reports: {
        Row: {
          benchmarks: Json
          created_at: string
          id: string
          metrics: Json
          metrics_json: Json | null
          period_end: string | null
          period_start: string | null
          sent_at: string | null
          store_id: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          benchmarks?: Json
          created_at?: string
          id?: string
          metrics?: Json
          metrics_json?: Json | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          store_id?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          benchmarks?: Json
          created_at?: string
          id?: string
          metrics?: Json
          metrics_json?: Json | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          store_id?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_segments: {
        Row: {
          campaign_id: string
          created_at: string
          estimated_reach: number
          filters: Json
          id: string
          type: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          estimated_reach?: number
          filters?: Json
          id?: string
          type: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          estimated_reach?: number
          filters?: Json
          id?: string
          type?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          blocks: Json | null
          channel: string
          created_at: string
          delivered_count: number
          id: string
          message: string
          name: string
          read_count: number
          reply_count: number
          scheduled_at: string | null
          sent_count: number
          status: string
          store_id: string | null
          subject: string | null
          total_contacts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          blocks?: Json | null
          channel?: string
          created_at?: string
          delivered_count?: number
          id?: string
          message: string
          name: string
          read_count?: number
          reply_count?: number
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          store_id?: string | null
          subject?: string | null
          total_contacts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          blocks?: Json | null
          channel?: string
          created_at?: string
          delivered_count?: number
          id?: string
          message?: string
          name?: string
          read_count?: number
          reply_count?: number
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          store_id?: string | null
          subject?: string | null
          total_contacts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          credenciais_json: Json | null
          erro_sync: string | null
          id: string
          last_sync_at: string | null
          nome_canal: string | null
          plataforma: string | null
          reputacao_json: Json | null
          status_sync: string | null
          store_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          credenciais_json?: Json | null
          erro_sync?: string | null
          id?: string
          last_sync_at?: string | null
          nome_canal?: string | null
          plataforma?: string | null
          reputacao_json?: Json | null
          status_sync?: string | null
          store_id?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          credenciais_json?: Json | null
          erro_sync?: string | null
          id?: string
          last_sync_at?: string | null
          nome_canal?: string | null
          plataforma?: string | null
          reputacao_json?: Json | null
          status_sync?: string | null
          store_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      communications_sent: {
        Row: {
          aberto_em: string | null
          canal: string | null
          cliente_id: string | null
          convertido_em: string | null
          enviado_em: string | null
          execucao_id: string | null
          id: string
          prescricao_id: string | null
          status: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          aberto_em?: string | null
          canal?: string | null
          cliente_id?: string | null
          convertido_em?: string | null
          enviado_em?: string | null
          execucao_id?: string | null
          id?: string
          prescricao_id?: string | null
          status?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          aberto_em?: string | null
          canal?: string | null
          cliente_id?: string | null
          convertido_em?: string | null
          enviado_em?: string | null
          execucao_id?: string | null
          id?: string
          prescricao_id?: string | null
          status?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_enviadas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_enviadas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          status: string
          store_id: string | null
          tags: string[] | null
          total_orders: number
          total_spent: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          status?: string
          store_id?: string | null
          tags?: string[] | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          status?: string
          store_id?: string | null
          tags?: string[] | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          status: string
          store_id: string | null
          unread_count: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          status?: string
          store_id?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          status?: string
          store_id?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      convertiq_settings: {
        Row: {
          alertas_ativos: boolean
          created_at: string | null
          id: string
          integracao_ga4: boolean
          meta_conversao: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alertas_ativos?: boolean
          created_at?: string | null
          id?: string
          integracao_ga4?: boolean
          meta_conversao?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alertas_ativos?: boolean
          created_at?: string | null
          id?: string
          integracao_ga4?: boolean
          meta_conversao?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customers_v3: {
        Row: {
          behavioral_profile: string | null
          birth_date: string | null
          churn_score: number | null
          created_at: string | null
          customer_health_score: number | null
          email: string | null
          id: string
          last_purchase_at: string | null
          name: string | null
          phone: string | null
          preferred_channel: string | null
          rfm_frequency: number | null
          rfm_monetary: number | null
          rfm_recency: number | null
          rfm_segment: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          behavioral_profile?: string | null
          birth_date?: string | null
          churn_score?: number | null
          created_at?: string | null
          customer_health_score?: number | null
          email?: string | null
          id?: string
          last_purchase_at?: string | null
          name?: string | null
          phone?: string | null
          preferred_channel?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_segment?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          behavioral_profile?: string | null
          birth_date?: string | null
          churn_score?: number | null
          created_at?: string | null
          customer_health_score?: number | null
          email?: string | null
          id?: string
          last_purchase_at?: string | null
          name?: string | null
          phone?: string | null
          preferred_channel?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_segment?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_v3_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_v3_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostics: {
        Row: {
          created_at: string | null
          dados_funil: Json | null
          id: string
          meta_conversao: number
          recomendacoes: Json | null
          resumo: string | null
          score: number | null
          status: string
          store_id: string | null
          taxa_conversao: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dados_funil?: Json | null
          id?: string
          meta_conversao?: number
          recomendacoes?: Json | null
          resumo?: string | null
          score?: number | null
          status?: string
          store_id?: string | null
          taxa_conversao?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          dados_funil?: Json | null
          id?: string
          meta_conversao?: number
          recomendacoes?: Json | null
          resumo?: string | null
          score?: number | null
          status?: string
          store_id?: string | null
          taxa_conversao?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      diagnostics_v3: {
        Row: {
          chs: number | null
          chs_label: string | null
          created_at: string | null
          diagnostic_json: Json | null
          id: string
          store_id: string | null
        }
        Insert: {
          chs?: number | null
          chs_label?: string | null
          created_at?: string | null
          diagnostic_json?: Json | null
          id?: string
          store_id?: string | null
        }
        Update: {
          chs?: number | null
          chs_label?: string | null
          created_at?: string | null
          diagnostic_json?: Json | null
          id?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostics_v3_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostics_v3_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      executions: {
        Row: {
          aberturas: number | null
          chs_antes: number | null
          chs_depois: number | null
          cliques: number | null
          concluida_em: string | null
          conversao_antes: number | null
          conversao_depois: number | null
          conversoes: number | null
          conversoes_assistidas: number | null
          conversoes_diretas: number | null
          custo_desconto: number | null
          entregues: number | null
          enviados: number | null
          id: string
          iniciada_em: string | null
          margem_gerada: number | null
          prescricao_id: string | null
          receita_gerada: number | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          aberturas?: number | null
          chs_antes?: number | null
          chs_depois?: number | null
          cliques?: number | null
          concluida_em?: string | null
          conversao_antes?: number | null
          conversao_depois?: number | null
          conversoes?: number | null
          conversoes_assistidas?: number | null
          conversoes_diretas?: number | null
          custo_desconto?: number | null
          entregues?: number | null
          enviados?: number | null
          id?: string
          iniciada_em?: string | null
          margem_gerada?: number | null
          prescricao_id?: string | null
          receita_gerada?: number | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          aberturas?: number | null
          chs_antes?: number | null
          chs_depois?: number | null
          cliques?: number | null
          concluida_em?: string | null
          conversao_antes?: number | null
          conversao_depois?: number | null
          conversoes?: number | null
          conversoes_assistidas?: number | null
          conversoes_diretas?: number | null
          custo_desconto?: number | null
          entregues?: number | null
          enviados?: number | null
          id?: string
          iniciada_em?: string | null
          margem_gerada?: number | null
          prescricao_id?: string | null
          receita_gerada?: number | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      forecast_snapshots: {
        Row: {
          cenario_base: number | null
          cenario_com_prescricoes: number | null
          cenario_com_ux: number | null
          confianca_ia: number | null
          created_at: string | null
          data_calculo: string | null
          id: string
          store_id: string | null
        }
        Insert: {
          cenario_base?: number | null
          cenario_com_prescricoes?: number | null
          cenario_com_ux?: number | null
          confianca_ia?: number | null
          created_at?: string | null
          data_calculo?: string | null
          id?: string
          store_id?: string | null
        }
        Update: {
          cenario_base?: number | null
          cenario_com_prescricoes?: number | null
          cenario_com_ux?: number | null
          confianca_ia?: number | null
          created_at?: string | null
          data_calculo?: string | null
          id?: string
          store_id?: string | null
        }
        Relationships: []
      }
      funnel_metrics: {
        Row: {
          adicionou_carrinho: number
          compras: number
          created_at: string | null
          data: string
          id: string
          iniciou_checkout: number
          receita: number
          store_id: string
          user_id: string
          visitantes: number
          visualizacoes_produto: number
        }
        Insert: {
          adicionou_carrinho?: number
          compras?: number
          created_at?: string | null
          data?: string
          id?: string
          iniciou_checkout?: number
          receita?: number
          store_id: string
          user_id: string
          visitantes?: number
          visualizacoes_produto?: number
        }
        Update: {
          adicionou_carrinho?: number
          compras?: number
          created_at?: string | null
          data?: string
          id?: string
          iniciou_checkout?: number
          receita?: number
          store_id?: string
          user_id?: string
          visitantes?: number
          visualizacoes_produto?: number
        }
        Relationships: []
      }
      funnel_metrics_v3: {
        Row: {
          canal_id: string | null
          carrinho: number | null
          checkout: number | null
          created_at: string | null
          data_referencia: string | null
          id: string
          pedido: number | null
          pedidos_desktop: number | null
          pedidos_mobile: number | null
          periodo: string | null
          produto_visto: number | null
          store_id: string | null
          user_id: string
          visitantes: number | null
          visitantes_desktop: number | null
          visitantes_mobile: number | null
        }
        Insert: {
          canal_id?: string | null
          carrinho?: number | null
          checkout?: number | null
          created_at?: string | null
          data_referencia?: string | null
          id?: string
          pedido?: number | null
          pedidos_desktop?: number | null
          pedidos_mobile?: number | null
          periodo?: string | null
          produto_visto?: number | null
          store_id?: string | null
          user_id: string
          visitantes?: number | null
          visitantes_desktop?: number | null
          visitantes_mobile?: number | null
        }
        Update: {
          canal_id?: string | null
          carrinho?: number | null
          checkout?: number | null
          created_at?: string | null
          data_referencia?: string | null
          id?: string
          pedido?: number | null
          pedidos_desktop?: number | null
          pedidos_mobile?: number | null
          periodo?: string | null
          produto_visto?: number | null
          store_id?: string | null
          user_id?: string
          visitantes?: number | null
          visitantes_desktop?: number | null
          visitantes_mobile?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_funil_v3_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_funil_v3_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          config_json: Json | null
          created_at: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          name: string
          store_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          config_json?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          name: string
          store_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          config_json?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          name?: string
          store_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys_config: {
        Row: {
          ativa: boolean | null
          config_json: Json | null
          id: string
          kpi_atual: number | null
          store_id: string | null
          tipo_jornada: string
          updated_at: string | null
        }
        Insert: {
          ativa?: boolean | null
          config_json?: Json | null
          id?: string
          kpi_atual?: number | null
          store_id?: string | null
          tipo_jornada: string
          updated_at?: string | null
        }
        Update: {
          ativa?: boolean | null
          config_json?: Json | null
          id?: string
          kpi_atual?: number | null
          store_id?: string | null
          tipo_jornada?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      loyalty_config: {
        Row: {
          ativo: boolean | null
          id: string
          pontos_por_real: number | null
          store_id: string | null
          tier_diamante_min: number | null
          tier_ouro_min: number | null
          tier_prata_min: number | null
          updated_at: string | null
          validade_pontos_dias: number | null
        }
        Insert: {
          ativo?: boolean | null
          id?: string
          pontos_por_real?: number | null
          store_id?: string | null
          tier_diamante_min?: number | null
          tier_ouro_min?: number | null
          tier_prata_min?: number | null
          updated_at?: string | null
          validade_pontos_dias?: number | null
        }
        Update: {
          ativo?: boolean | null
          id?: string
          pontos_por_real?: number | null
          store_id?: string | null
          tier_diamante_min?: number | null
          tier_ouro_min?: number | null
          tier_prata_min?: number | null
          updated_at?: string | null
          validade_pontos_dias?: number | null
        }
        Relationships: []
      }
      loyalty_points: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          last_activity_at: string
          points: number
          tier: string
          total_earned: number
          total_redeemed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          last_activity_at?: string
          points?: number
          tier?: string
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          last_activity_at?: string
          points?: number
          tier?: string
          total_earned?: number
          total_redeemed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points_v3: {
        Row: {
          cliente_id: string | null
          created_at: string | null
          expira_em: string | null
          id: string
          motivo: string | null
          quantidade: number
          store_id: string | null
          tipo: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string | null
          expira_em?: string | null
          id?: string
          motivo?: string | null
          quantidade: number
          store_id?: string | null
          tipo?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string | null
          expira_em?: string | null
          id?: string
          motivo?: string | null
          quantidade?: number
          store_id?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      loyalty_rewards: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          custo_pontos: number
          descricao: string | null
          id: string
          nome: string
          store_id: string | null
          tipo: string | null
          valor_beneficio: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          custo_pontos: number
          descricao?: string | null
          id?: string
          nome: string
          store_id?: string | null
          tipo?: string | null
          valor_beneficio?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          custo_pontos?: number
          descricao?: string | null
          id?: string
          nome?: string
          store_id?: string | null
          tipo?: string | null
          valor_beneficio?: number | null
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          contact_id: string
          created_at: string
          description: string | null
          id: string
          points: number
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          description?: string | null
          id?: string
          points: number
          reason: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          description?: string | null
          id?: string
          points?: number
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membros_loja: {
        Row: {
          convidado_por: string | null
          created_at: string | null
          id: string
          permissao: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          convidado_por?: string | null
          created_at?: string | null
          id?: string
          permissao?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          convidado_por?: string | null
          created_at?: string | null
          id?: string
          permissao?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      message_sends: {
        Row: {
          automation_id: string | null
          campaign_id: string | null
          contact_id: string | null
          id: string
          message_id: string | null
          phone: string
          sent_at: string
          status: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          automation_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          id?: string
          message_id?: string | null
          phone: string
          sent_at?: string
          status?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          automation_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          id?: string
          message_id?: string | null
          phone?: string
          sent_at?: string
          status?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_sends_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sends_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sends_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string | null
          id: string
          lida: boolean | null
          link: string | null
          mensagem: string | null
          store_id: string | null
          tipo: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          mensagem?: string | null
          store_id?: string | null
          tipo?: string | null
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          mensagem?: string | null
          store_id?: string | null
          tipo?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          dados_json: Json | null
          description: string | null
          detected_at: string | null
          estimated_impact: number | null
          id: string
          resolved_at: string | null
          root_cause: string | null
          severity: string | null
          status: string | null
          store_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          dados_json?: Json | null
          description?: string | null
          detected_at?: string | null
          estimated_impact?: number | null
          id?: string
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          status?: string | null
          store_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          dados_json?: Json | null
          description?: string | null
          detected_at?: string | null
          estimated_impact?: number | null
          id?: string
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          status?: string | null
          store_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      opt_outs: {
        Row: {
          canal: string | null
          cliente_id: string | null
          id: string
          motivo: string | null
          registrado_em: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          canal?: string | null
          cliente_id?: string | null
          id?: string
          motivo?: string | null
          registrado_em?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          canal?: string | null
          cliente_id?: string | null
          id?: string
          motivo?: string | null
          registrado_em?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          contact_id: string | null
          created_at: string
          currency: string | null
          external_order_id: string | null
          id: string
          items_count: number | null
          source: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          external_order_id?: string | null
          id?: string
          items_count?: number | null
          source?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          external_order_id?: string | null
          id?: string
          items_count?: number | null
          source?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orders_v3: {
        Row: {
          atribuicao_manual: boolean | null
          canal_id: string | null
          canal_tipo: string | null
          cliente_id: string | null
          created_at: string | null
          cupom_utilizado: string | null
          entregue_em: string | null
          id: string
          is_primeira_compra: boolean | null
          margem_estimada: number | null
          pedido_externo_id: string | null
          produtos_json: Json | null
          status: string | null
          store_id: string | null
          user_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          valor: number
          valor_desconto: number | null
        }
        Insert: {
          atribuicao_manual?: boolean | null
          canal_id?: string | null
          canal_tipo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          cupom_utilizado?: string | null
          entregue_em?: string | null
          id?: string
          is_primeira_compra?: boolean | null
          margem_estimada?: number | null
          pedido_externo_id?: string | null
          produtos_json?: Json | null
          status?: string | null
          store_id?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          valor: number
          valor_desconto?: number | null
        }
        Update: {
          atribuicao_manual?: boolean | null
          canal_id?: string | null
          canal_tipo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          cupom_utilizado?: string | null
          entregue_em?: string | null
          id?: string
          is_primeira_compra?: boolean | null
          margem_estimada?: number | null
          pedido_externo_id?: string | null
          produtos_json?: Json | null
          status?: string | null
          store_id?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          valor?: number
          valor_desconto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_v3_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_v3_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_results: {
        Row: {
          channel: string | null
          contact_id: string | null
          conversion_at: string | null
          conversion_value: number | null
          converted: boolean | null
          coupon_used: string | null
          created_at: string | null
          days_to_convert: number | null
          discount_pct: number | null
          executed_at: string | null
          id: string
          prescription_id: string
          prescription_type: string
          sent_day_of_week: number | null
          sent_hour: number | null
          used_preferred_hour: boolean | null
          user_id: string
        }
        Insert: {
          channel?: string | null
          contact_id?: string | null
          conversion_at?: string | null
          conversion_value?: number | null
          converted?: boolean | null
          coupon_used?: string | null
          created_at?: string | null
          days_to_convert?: number | null
          discount_pct?: number | null
          executed_at?: string | null
          id?: string
          prescription_id: string
          prescription_type: string
          sent_day_of_week?: number | null
          sent_hour?: number | null
          used_preferred_hour?: boolean | null
          user_id: string
        }
        Update: {
          channel?: string | null
          contact_id?: string | null
          conversion_at?: string | null
          conversion_value?: number | null
          converted?: boolean | null
          coupon_used?: string | null
          created_at?: string | null
          days_to_convert?: number | null
          discount_pct?: number | null
          executed_at?: string | null
          id?: string
          prescription_id?: string
          prescription_type?: string
          sent_day_of_week?: number | null
          sent_hour?: number | null
          used_preferred_hour?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          behavioral_profile_target: string | null
          created_at: string | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          estimated_potential: number | null
          estimated_roi: number | null
          execution_channel: string | null
          id: string
          num_clients_target: number | null
          opportunity_id: string | null
          segment_target: string | null
          status: string | null
          store_id: string | null
          template_json: Json | null
          title: string
          user_id: string
        }
        Insert: {
          behavioral_profile_target?: string | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          estimated_potential?: number | null
          estimated_roi?: number | null
          execution_channel?: string | null
          id?: string
          num_clients_target?: number | null
          opportunity_id?: string | null
          segment_target?: string | null
          status?: string | null
          store_id?: string | null
          template_json?: Json | null
          title: string
          user_id: string
        }
        Update: {
          behavioral_profile_target?: string | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          estimated_potential?: number | null
          estimated_roi?: number | null
          execution_channel?: string | null
          id?: string
          num_clients_target?: number | null
          opportunity_id?: string | null
          segment_target?: string | null
          status?: string | null
          store_id?: string | null
          template_json?: Json | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "problemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          canal_id: string | null
          categoria: string | null
          created_at: string | null
          custo: number | null
          estoque: number | null
          estoque_critico: boolean | null
          id: string
          media_avaliacao: number | null
          nome: string
          num_adicionados_carrinho: number | null
          num_avaliacoes: number | null
          num_vendas: number | null
          num_visualizacoes: number | null
          preco: number | null
          produto_externo_id: string | null
          receita_30d: number | null
          sku: string | null
          store_id: string | null
          taxa_conversao_produto: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          canal_id?: string | null
          categoria?: string | null
          created_at?: string | null
          custo?: number | null
          estoque?: number | null
          estoque_critico?: boolean | null
          id?: string
          media_avaliacao?: number | null
          nome: string
          num_adicionados_carrinho?: number | null
          num_avaliacoes?: number | null
          num_vendas?: number | null
          num_visualizacoes?: number | null
          preco?: number | null
          produto_externo_id?: string | null
          receita_30d?: number | null
          sku?: string | null
          store_id?: string | null
          taxa_conversao_produto?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          canal_id?: string | null
          categoria?: string | null
          created_at?: string | null
          custo?: number | null
          estoque?: number | null
          estoque_critico?: boolean | null
          id?: string
          media_avaliacao?: number | null
          nome?: string
          num_adicionados_carrinho?: number | null
          num_avaliacoes?: number | null
          num_vendas?: number | null
          num_visualizacoes?: number | null
          preco?: number | null
          produto_externo_id?: string | null
          receita_30d?: number | null
          sku?: string | null
          store_id?: string | null
          taxa_conversao_produto?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_model: string | null
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          ia_max_discount_pct: number | null
          ia_negotiation_enabled: boolean | null
          id: string
          knowledge_base: string | null
          loyalty_program_name: string | null
          loyalty_slug: string | null
          onboarding_completed: boolean
          pix_key: string | null
          plan: string
          points_per_real: number | null
          role: string | null
          social_proof_enabled: boolean | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          ia_max_discount_pct?: number | null
          ia_negotiation_enabled?: boolean | null
          id: string
          knowledge_base?: string | null
          loyalty_program_name?: string | null
          loyalty_slug?: string | null
          onboarding_completed?: boolean
          pix_key?: string | null
          plan?: string
          points_per_real?: number | null
          role?: string | null
          social_proof_enabled?: boolean | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          ia_max_discount_pct?: number | null
          ia_negotiation_enabled?: boolean | null
          id?: string
          knowledge_base?: string | null
          loyalty_program_name?: string | null
          loyalty_slug?: string | null
          onboarding_completed?: boolean
          pix_key?: string | null
          plan?: string
          points_per_real?: number | null
          role?: string | null
          social_proof_enabled?: boolean | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      review_requests: {
        Row: {
          clicked_at: string | null
          contact_id: string | null
          created_at: string
          id: string
          message_sent_at: string | null
          order_id: string | null
          platform: string
          review_left: boolean
          user_id: string
        }
        Insert: {
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          message_sent_at?: string | null
          order_id?: string | null
          platform?: string
          review_left?: boolean
          user_id: string
        }
        Update: {
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          message_sent_at?: string | null
          order_id?: string | null
          platform?: string
          review_left?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          ai_reply: string | null
          content: string | null
          created_at: string
          id: string
          platform: string
          rating: number | null
          raw_payload: Json | null
          replied_at: string | null
          reviewer_name: string
          status: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          ai_reply?: string | null
          content?: string | null
          created_at?: string
          id?: string
          platform?: string
          rating?: number | null
          raw_payload?: Json | null
          replied_at?: string | null
          reviewer_name: string
          status?: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          ai_reply?: string | null
          content?: string | null
          created_at?: string
          id?: string
          platform?: string
          rating?: number | null
          raw_payload?: Json | null
          replied_at?: string | null
          reviewer_name?: string
          status?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_calendar: {
        Row: {
          data_evento: string
          descricao: string | null
          dias_antecedencia_ideal: number | null
          id: string
          nome: string
          segmentos_relevantes: string[] | null
          tipo: string | null
        }
        Insert: {
          data_evento: string
          descricao?: string | null
          dias_antecedencia_ideal?: number | null
          id?: string
          nome: string
          segmentos_relevantes?: string[] | null
          tipo?: string | null
        }
        Update: {
          data_evento?: string
          descricao?: string | null
          dias_antecedencia_ideal?: number | null
          id?: string
          nome?: string
          segmentos_relevantes?: string[] | null
          tipo?: string | null
        }
        Relationships: []
      }
      sector_benchmarks: {
        Row: {
          cvr_media: number | null
          cvr_top_20: number | null
          id: string
          segmento: string
          taxa_carrinho_media: number | null
          taxa_checkout_media: number | null
          ticket_medio_referencia: number | null
          updated_at: string | null
        }
        Insert: {
          cvr_media?: number | null
          cvr_top_20?: number | null
          id?: string
          segmento: string
          taxa_carrinho_media?: number | null
          taxa_checkout_media?: number | null
          ticket_medio_referencia?: number | null
          updated_at?: string | null
        }
        Update: {
          cvr_media?: number | null
          cvr_top_20?: number | null
          id?: string
          segmento?: string
          taxa_carrinho_media?: number | null
          taxa_checkout_media?: number | null
          ticket_medio_referencia?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      settings_v3: {
        Row: {
          auto_approval: boolean | null
          auto_custo_maximo: number | null
          auto_potencial_minimo: number | null
          auto_roi_minimo: number | null
          average_margin: number | null
          average_ticket: number | null
          cap_msgs_email_semana: number | null
          cap_msgs_whatsapp_semana: number | null
          conversion_goal: number | null
          cooldown_pos_compra_dias: number | null
          id: string
          notif_email: string | null
          notif_frequencia: string | null
          notif_whatsapp: string | null
          pulse_active: boolean | null
          pulse_day_of_week: number | null
          pulse_time: string | null
          pulse_whatsapp_number: string | null
          store_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_approval?: boolean | null
          auto_custo_maximo?: number | null
          auto_potencial_minimo?: number | null
          auto_roi_minimo?: number | null
          average_margin?: number | null
          average_ticket?: number | null
          cap_msgs_email_semana?: number | null
          cap_msgs_whatsapp_semana?: number | null
          conversion_goal?: number | null
          cooldown_pos_compra_dias?: number | null
          id?: string
          notif_email?: string | null
          notif_frequencia?: string | null
          notif_whatsapp?: string | null
          pulse_active?: boolean | null
          pulse_day_of_week?: number | null
          pulse_time?: string | null
          pulse_whatsapp_number?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_approval?: boolean | null
          auto_custo_maximo?: number | null
          auto_potencial_minimo?: number | null
          auto_roi_minimo?: number | null
          average_margin?: number | null
          average_ticket?: number | null
          cap_msgs_email_semana?: number | null
          cap_msgs_whatsapp_semana?: number | null
          conversion_goal?: number | null
          cooldown_pos_compra_dias?: number | null
          id?: string
          notif_email?: string | null
          notif_frequencia?: string | null
          notif_whatsapp?: string | null
          pulse_active?: boolean | null
          pulse_day_of_week?: number | null
          pulse_time?: string | null
          pulse_whatsapp_number?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sms_connections: {
        Row: {
          api_key: string | null
          api_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          provider: string
          sender_id: string | null
          sent_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          sender_id?: string | null
          sent_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          sender_id?: string | null
          sent_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_benchmark_scores: {
        Row: {
          churn_percentil: number | null
          cvr_percentil: number | null
          id: string
          ltv_percentil: number | null
          nicho: string
          periodo: string
          score_anterior: number | null
          score_delta: number | null
          score_geral: number | null
          ticket_percentil: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          churn_percentil?: number | null
          cvr_percentil?: number | null
          id?: string
          ltv_percentil?: number | null
          nicho: string
          periodo: string
          score_anterior?: number | null
          score_delta?: number | null
          score_geral?: number | null
          ticket_percentil?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          churn_percentil?: number | null
          cvr_percentil?: number | null
          id?: string
          ltv_percentil?: number | null
          nicho?: string
          periodo?: string
          score_anterior?: number | null
          score_delta?: number | null
          score_geral?: number | null
          ticket_percentil?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      store_benchmarks: {
        Row: {
          best_day_p50: number | null
          best_hour_p50: number | null
          boleto_recovery_rate_p50: number | null
          cart_recovery_rate_p50: number | null
          churn_p50: number | null
          cvr_p25: number | null
          cvr_p50: number | null
          cvr_p75: number | null
          cvr_p90: number | null
          id: string
          ltv_p50: number | null
          ltv_p75: number | null
          nicho: string
          periodo: string
          reactivation_rate_p50: number | null
          store_count: number
          ticket_p50: number | null
          updated_at: string | null
        }
        Insert: {
          best_day_p50?: number | null
          best_hour_p50?: number | null
          boleto_recovery_rate_p50?: number | null
          cart_recovery_rate_p50?: number | null
          churn_p50?: number | null
          cvr_p25?: number | null
          cvr_p50?: number | null
          cvr_p75?: number | null
          cvr_p90?: number | null
          id?: string
          ltv_p50?: number | null
          ltv_p75?: number | null
          nicho: string
          periodo: string
          reactivation_rate_p50?: number | null
          store_count?: number
          ticket_p50?: number | null
          updated_at?: string | null
        }
        Update: {
          best_day_p50?: number | null
          best_hour_p50?: number | null
          boleto_recovery_rate_p50?: number | null
          cart_recovery_rate_p50?: number | null
          churn_p50?: number | null
          cvr_p25?: number | null
          cvr_p50?: number | null
          cvr_p75?: number | null
          cvr_p90?: number | null
          id?: string
          ltv_p50?: number | null
          ltv_p75?: number | null
          nicho?: string
          periodo?: string
          reactivation_rate_p50?: number | null
          store_count?: number
          ticket_p50?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stores: {
        Row: {
          chs_history: Json | null
          conversion_health_score: number | null
          created_at: string | null
          id: string
          name: string
          pix_key: string | null
          segment: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chs_history?: Json | null
          conversion_health_score?: number | null
          created_at?: string | null
          id?: string
          name: string
          pix_key?: string | null
          segment?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chs_history?: Json | null
          conversion_health_score?: number | null
          created_at?: string | null
          id?: string
          name?: string
          pix_key?: string | null
          segment?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          id: string
          maintenance_active: boolean | null
          maintenance_message: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          maintenance_active?: boolean | null
          maintenance_message?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          maintenance_active?: boolean | null
          maintenance_message?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          account_owner_id: string
          id: string
          invited_at: string
          invited_email: string
          invited_user_id: string | null
          role: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          account_owner_id: string
          id?: string
          invited_at?: string
          invited_email: string
          invited_user_id?: string | null
          role?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          account_owner_id?: string
          id?: string
          invited_at?: string
          invited_email?: string
          invited_user_id?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_account_owner_id_fkey"
            columns: ["account_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          erro_mensagem: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json | null
          payload_bruto: Json | null
          plataforma: string | null
          source: string
          status: string
          status_processamento: string | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          erro_mensagem?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          payload_bruto?: Json | null
          plataforma?: string | null
          source: string
          status?: string
          status_processamento?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          erro_mensagem?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          payload_bruto?: Json | null
          plataforma?: string | null
          source?: string
          status?: string
          status_processamento?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          created_at: string | null
          evolution_api_key: string | null
          evolution_api_url: string | null
          id: string
          instance_name: string
          status: string | null
          store_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          instance_name: string
          status?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          instance_name?: string
          status?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_flows: {
        Row: {
          config: Json | null
          created_at: string | null
          flow_id: string
          id: string
          name: string
          screen_id: string
          user_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          flow_id: string
          id?: string
          name: string
          screen_id: string
          user_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          flow_id?: string
          id?: string
          name?: string
          screen_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label: {
        Row: {
          brand_logo_url: string | null
          brand_name: string | null
          created_at: string
          custom_domain: string | null
          hide_conversahub_branding: boolean
          id: string
          primary_color: string | null
          support_email: string | null
          support_whatsapp: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          custom_domain?: string | null
          hide_conversahub_branding?: boolean
          id?: string
          primary_color?: string | null
          support_email?: string | null
          support_whatsapp?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string
          custom_domain?: string | null
          hide_conversahub_branding?: boolean
          id?: string
          primary_color?: string | null
          support_email?: string | null
          support_whatsapp?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      canais: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          credenciais_json: Json | null
          erro_sync: string | null
          id: string | null
          last_sync_at: string | null
          nome_canal: string | null
          plataforma: string | null
          reputacao_json: Json | null
          status_sync: string | null
          store_id: string | null
          tipo: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          credenciais_json?: Json | null
          erro_sync?: string | null
          id?: string | null
          last_sync_at?: string | null
          nome_canal?: string | null
          plataforma?: string | null
          reputacao_json?: Json | null
          status_sync?: string | null
          store_id?: string | null
          tipo?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          credenciais_json?: Json | null
          erro_sync?: string | null
          id?: string | null
          last_sync_at?: string | null
          nome_canal?: string | null
          plataforma?: string | null
          reputacao_json?: Json | null
          status_sync?: string | null
          store_id?: string | null
          tipo?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          behavioral_profile: string | null
          birth_date: string | null
          churn_score: number | null
          created_at: string | null
          customer_health_score: number | null
          email: string | null
          id: string | null
          last_purchase_at: string | null
          name: string | null
          phone: string | null
          preferred_channel: string | null
          rfm_frequency: number | null
          rfm_monetary: number | null
          rfm_recency: number | null
          rfm_segment: string | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          behavioral_profile?: string | null
          birth_date?: string | null
          churn_score?: number | null
          created_at?: string | null
          customer_health_score?: number | null
          email?: string | null
          id?: string | null
          last_purchase_at?: string | null
          name?: string | null
          phone?: string | null
          preferred_channel?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_segment?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          behavioral_profile?: string | null
          birth_date?: string | null
          churn_score?: number | null
          created_at?: string | null
          customer_health_score?: number | null
          email?: string | null
          id?: string | null
          last_purchase_at?: string | null
          name?: string | null
          phone?: string | null
          preferred_channel?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_segment?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_v3_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_v3_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacoes_enviadas: {
        Row: {
          aberto_em: string | null
          canal: string | null
          cliente_id: string | null
          convertido_em: string | null
          enviado_em: string | null
          execucao_id: string | null
          id: string | null
          prescricao_id: string | null
          status: string | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          aberto_em?: string | null
          canal?: string | null
          cliente_id?: string | null
          convertido_em?: string | null
          enviado_em?: string | null
          execucao_id?: string | null
          id?: string | null
          prescricao_id?: string | null
          status?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          aberto_em?: string | null
          canal?: string | null
          cliente_id?: string | null
          convertido_em?: string | null
          enviado_em?: string | null
          execucao_id?: string | null
          id?: string | null
          prescricao_id?: string | null
          status?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_enviadas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_enviadas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes: {
        Row: {
          aberturas: number | null
          chs_antes: number | null
          chs_depois: number | null
          cliques: number | null
          concluida_em: string | null
          conversao_antes: number | null
          conversao_depois: number | null
          conversoes: number | null
          conversoes_assistidas: number | null
          conversoes_diretas: number | null
          custo_desconto: number | null
          entregues: number | null
          enviados: number | null
          id: string | null
          iniciada_em: string | null
          margem_gerada: number | null
          prescricao_id: string | null
          receita_gerada: number | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          aberturas?: number | null
          chs_antes?: number | null
          chs_depois?: number | null
          cliques?: number | null
          concluida_em?: string | null
          conversao_antes?: number | null
          conversao_depois?: number | null
          conversoes?: number | null
          conversoes_assistidas?: number | null
          conversoes_diretas?: number | null
          custo_desconto?: number | null
          entregues?: number | null
          enviados?: number | null
          id?: string | null
          iniciada_em?: string | null
          margem_gerada?: number | null
          prescricao_id?: string | null
          receita_gerada?: number | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          aberturas?: number | null
          chs_antes?: number | null
          chs_depois?: number | null
          cliques?: number | null
          concluida_em?: string | null
          conversao_antes?: number | null
          conversao_depois?: number | null
          conversoes?: number | null
          conversoes_assistidas?: number | null
          conversoes_diretas?: number | null
          custo_desconto?: number | null
          entregues?: number | null
          enviados?: number | null
          id?: string | null
          iniciada_em?: string | null
          margem_gerada?: number | null
          prescricao_id?: string | null
          receita_gerada?: number | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      lojas: {
        Row: {
          chs_history: Json | null
          conversion_health_score: number | null
          created_at: string | null
          id: string | null
          name: string | null
          pix_key: string | null
          segment: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          chs_history?: Json | null
          conversion_health_score?: number | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          pix_key?: string | null
          segment?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          chs_history?: Json | null
          conversion_health_score?: number | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          pix_key?: string | null
          segment?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pedidos_v3_legacy: {
        Row: {
          atribuicao_manual: boolean | null
          canal_id: string | null
          canal_tipo: string | null
          cliente_id: string | null
          created_at: string | null
          cupom_utilizado: string | null
          entregue_em: string | null
          id: string | null
          is_primeira_compra: boolean | null
          margem_estimada: number | null
          pedido_externo_id: string | null
          produtos_json: Json | null
          status: string | null
          store_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          valor: number | null
          valor_desconto: number | null
        }
        Insert: {
          atribuicao_manual?: boolean | null
          canal_id?: string | null
          canal_tipo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          cupom_utilizado?: string | null
          entregue_em?: string | null
          id?: string | null
          is_primeira_compra?: boolean | null
          margem_estimada?: number | null
          pedido_externo_id?: string | null
          produtos_json?: Json | null
          status?: string | null
          store_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          valor?: number | null
          valor_desconto?: number | null
        }
        Update: {
          atribuicao_manual?: boolean | null
          canal_id?: string | null
          canal_tipo?: string | null
          cliente_id?: string | null
          created_at?: string | null
          cupom_utilizado?: string | null
          entregue_em?: string | null
          id?: string | null
          is_primeira_compra?: boolean | null
          margem_estimada?: number | null
          pedido_externo_id?: string | null
          produtos_json?: Json | null
          status?: string | null
          store_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          valor?: number | null
          valor_desconto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_v3_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_v3_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      prescricoes: {
        Row: {
          behavioral_profile_target: string | null
          created_at: string | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          estimated_potential: number | null
          estimated_roi: number | null
          execution_channel: string | null
          id: string | null
          num_clients_target: number | null
          opportunity_id: string | null
          segment_target: string | null
          status: string | null
          store_id: string | null
          template_json: Json | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          behavioral_profile_target?: string | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          estimated_potential?: number | null
          estimated_roi?: number | null
          execution_channel?: string | null
          id?: string | null
          num_clients_target?: number | null
          opportunity_id?: string | null
          segment_target?: string | null
          status?: string | null
          store_id?: string | null
          template_json?: Json | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          behavioral_profile_target?: string | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          estimated_potential?: number | null
          estimated_roi?: number | null
          execution_channel?: string | null
          id?: string | null
          num_clients_target?: number | null
          opportunity_id?: string | null
          segment_target?: string | null
          status?: string | null
          store_id?: string | null
          template_json?: Json | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "problemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      problemas: {
        Row: {
          dados_json: Json | null
          description: string | null
          detected_at: string | null
          estimated_impact: number | null
          id: string | null
          resolved_at: string | null
          root_cause: string | null
          severity: string | null
          status: string | null
          store_id: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          dados_json?: Json | null
          description?: string | null
          detected_at?: string | null
          estimated_impact?: number | null
          id?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          status?: string | null
          store_id?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          dados_json?: Json | null
          description?: string | null
          detected_at?: string | null
          estimated_impact?: number | null
          id?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string | null
          status?: string | null
          store_id?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          canal_id: string | null
          categoria: string | null
          created_at: string | null
          custo: number | null
          estoque: number | null
          estoque_critico: boolean | null
          id: string | null
          media_avaliacao: number | null
          nome: string | null
          num_adicionados_carrinho: number | null
          num_avaliacoes: number | null
          num_vendas: number | null
          num_visualizacoes: number | null
          preco: number | null
          produto_externo_id: string | null
          receita_30d: number | null
          sku: string | null
          store_id: string | null
          taxa_conversao_produto: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          canal_id?: string | null
          categoria?: string | null
          created_at?: string | null
          custo?: number | null
          estoque?: number | null
          estoque_critico?: boolean | null
          id?: string | null
          media_avaliacao?: number | null
          nome?: string | null
          num_adicionados_carrinho?: number | null
          num_avaliacoes?: number | null
          num_vendas?: number | null
          num_visualizacoes?: number | null
          preco?: number | null
          produto_externo_id?: string | null
          receita_30d?: number | null
          sku?: string | null
          store_id?: string | null
          taxa_conversao_produto?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          canal_id?: string | null
          categoria?: string | null
          created_at?: string | null
          custo?: number | null
          estoque?: number | null
          estoque_critico?: boolean | null
          id?: string | null
          media_avaliacao?: number | null
          nome?: string | null
          num_adicionados_carrinho?: number | null
          num_avaliacoes?: number | null
          num_vendas?: number | null
          num_visualizacoes?: number | null
          preco?: number | null
          produto_externo_id?: string | null
          receita_30d?: number | null
          sku?: string | null
          store_id?: string | null
          taxa_conversao_produto?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      sistema_config_legacy: {
        Row: {
          id: string | null
          maintenance_active: boolean | null
          maintenance_message: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string | null
          maintenance_active?: boolean | null
          maintenance_message?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string | null
          maintenance_active?: boolean | null
          maintenance_message?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_loyalty_points: {
        Args: {
          p_contact_id: string
          p_desc?: string
          p_points: number
          p_reason: string
          p_reference?: string
          p_user_id: string
        }
        Returns: undefined
      }
      append_chs_history: {
        Args: { new_label: string; new_score: number }
        Returns: Json
      }
      calcular_segmento_rfm: {
        Args: { frequencia: number; monetario: number; recencia: number }
        Returns: string
      }
      calculate_store_percentil: {
        Args: {
          p_cvr: number
          p_nicho: string
          p_periodo?: string
          p_user_id: string
        }
        Returns: number
      }
      calculate_tier: { Args: { p_total_earned: number }; Returns: string }
      get_optimal_send_hour: {
        Args: { p_contact_id: string; p_nicho?: string }
        Returns: number
      }
      increment_daily_analytics_messages: {
        Args: {
          p_date: string
          p_delivered?: number
          p_read?: number
          p_sent?: number
          p_store_id: string
        }
        Returns: undefined
      }
      increment_daily_revenue:
        | { Args: { p_amount: number; p_date: string }; Returns: undefined }
        | {
            Args: { p_amount: number; p_date: string; p_user_id: string }
            Returns: undefined
          }
      increment_unread_count: { Args: { conv_id: string }; Returns: undefined }
      resolve_loyalty_by_phone: {
        Args: { p_phone: string; p_slug: string }
        Returns: Json
      }
      update_loja_chs: {
        Args: { loja_uuid: string; new_label: string; new_score: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
