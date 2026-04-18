/**
 * Colunas explícitas para `.select()` nas Edge Functions (Deno).
 * Manter alinhado a `src/lib/supabase-select-fragments.ts` quando aplicável.
 */

export const CAMPAIGNS_DISPATCH_NEWSLETTER_SELECT =
  "id,name,status,channel,message,subject,subject_variant_b,preheader,ab_subject_enabled,blocks,created_at,updated_at,scheduled_at,sent_count,delivered_count,read_count,click_count,reply_count,total_contacts,store_id,user_id,source_prescription_id,attribution_window_days,custo_total_envio,email_recipient_mode,email_recipient_rfm,email_recipient_tag";

export const ANALYTICS_DAILY_WEEK_SELECT =
  "id,date,store_id,user_id,created_at,messages_sent,messages_delivered,messages_read,new_contacts,revenue_influenced,active_conversations";

export const AI_AGENT_CONFIG_SELECT =
  "id,user_id,store_id,ativo,modo,personalidade_preset,prompt_sistema,tom_de_voz,conhecimento_loja,updated_at";

export const JOURNEYS_CONFIG_FLOW_SELECT =
  "id,store_id,tipo_jornada,ativa,config_json,kpi_atual,updated_at";

export const STORES_FLOW_SELECT = "id,user_id,name,segment";

export const CUSTOMERS_V3_FLOW_SELECT = "id,name,rfm_segment";

export const ABANDONED_CARTS_TRIGGER_SELECT =
  "id,user_id,store_id,customer_id,recovery_url,cart_value,status,created_at,automation_id,cart_items,source,external_id";
