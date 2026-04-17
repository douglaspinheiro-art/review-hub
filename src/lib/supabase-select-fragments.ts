/**
 * Fragmentos de `.select()` reutilizáveis — evita `select('*')` e reduz payload / risco de expor colunas desnecessárias.
 * Manter alinhado a `Database["public"]["Tables"][...]["Row"]` em `integrations/supabase/types.ts`.
 */

export const CAMPAIGN_LIST_SELECT =
  "id,name,status,channel,message,subject,subject_variant_b,preheader,ab_subject_enabled,blocks,created_at,updated_at,scheduled_at,sent_count,delivered_count,read_count,click_count,reply_count,total_contacts,store_id,user_id,source_prescription_id,attribution_window_days,custo_total_envio,email_recipient_mode,email_recipient_rfm,email_recipient_tag";

export const CAMPAIGN_MESSAGE_TEMPLATE_SELECT =
  "id,user_id,store_id,name,objective,channel,message,whatsapp_config,created_at,updated_at";

/** Perfil mínimo para sessão / guards (AuthContext + Configurações baseline). */
export const PROFILE_SESSION_SELECT =
  "id,full_name,company_name,plan,role,trial_ends_at,onboarding_completed,ia_negotiation_enabled,ia_max_discount_pct,social_proof_enabled,pix_key";

export const STORE_V3_PUBLIC_SELECT =
  "id,user_id,name,segment,conversion_health_score,chs_history,pix_key,brand_primary_color,email_from_address,email_reply_to,created_at,updated_at";

export const CONVERTIQ_SETTINGS_SELECT =
  "id,user_id,meta_conversao,integracao_ga4,alertas_ativos,created_at,updated_at";

export const FUNNEL_METRICS_SELECT =
  "id,store_id,user_id,data,visitantes,visualizacoes_produto,adicionou_carrinho,iniciou_checkout,compras,receita,created_at";

export const DIAGNOSTICS_LIST_SELECT =
  "id,store_id,user_id,status,created_at,updated_at,resumo,recomendacoes,dados_funil,meta_conversao,taxa_conversao,score";

export const SECTOR_BENCHMARK_SELECT =
  "id,segmento,cvr_media,cvr_top_20,taxa_carrinho_media,taxa_checkout_media,ticket_medio_referencia,updated_at";

export const OPPORTUNITIES_EMBED_SELECT = "id,title,description,status,severity,estimated_impact";

export const PRESCRIPTIONS_WITH_OPPORTUNITY_SELECT = [
  "id,user_id,store_id,title,description,status,execution_channel,segment_target,num_clients_target",
  "discount_type,discount_value,estimated_potential,estimated_roi,template_json,opportunity_id,behavioral_profile_target,created_at",
  `opportunities(${OPPORTUNITIES_EMBED_SELECT})`,
].join(",");

export const OPPORTUNITIES_LIST_SELECT =
  "id,title,description,type,status,severity,estimated_impact,detected_at,resolved_at,root_cause,dados_json,user_id,store_id";

export const CHANNELS_LIST_SELECT =
  "id,store_id,user_id,tipo,nome_canal,plataforma,ativo,status_sync,erro_sync,last_sync_at,credenciais_json,reputacao_json,created_at";

export const WEBHOOK_LOGS_LIST_SELECT =
  "id,user_id,store_id,event_type,source,status,status_processamento,erro_mensagem,error_message,payload,payload_bruto,plataforma,created_at";

export const FUNNEL_METRICS_V3_SELECT =
  "id,store_id,user_id,canal_id,periodo,data_referencia,visitantes,produto_visto,carrinho,checkout,pedido,visitantes_mobile,visitantes_desktop,pedidos_mobile,pedidos_desktop,created_at";

export const FUNIL_DIARIO_SELECT =
  "id,store_id,user_id,periodo,metric_date,ingested_at,fonte,sessions,view_item,add_to_cart,begin_checkout,purchases,purchase_revenue,ga4_purchase_vs_orders_diff_pct";

export const DATA_QUALITY_SNAPSHOT_SELECT =
  "id,store_id,user_id,snapshot_date,created_at,metadata,parse_error_rate,phone_fill_rate,utm_fill_rate,duplicate_order_rate,ga4_purchase_vs_orders_diff_pct";

export const SYSTEM_CONFIG_SELECT = "id,maintenance_active,maintenance_message,updated_at";

export const SETTINGS_V3_SELECT =
  "id,user_id,store_id,cap_msgs_whatsapp_semana,cap_msgs_email_semana,cooldown_pos_compra_dias,pulse_active,pulse_day_of_week,pulse_time,pulse_whatsapp_number,auto_approval,auto_custo_maximo,auto_potencial_minimo,auto_roi_minimo,average_margin,average_ticket,conversion_goal,notif_email,notif_frequencia,notif_whatsapp,updated_at";

export const JOURNEYS_CONFIG_SELECT =
  "id,store_id,tipo_jornada,ativa,config_json,kpi_atual,updated_at";

export const TEAM_MEMBERS_LIST_SELECT =
  "id,account_owner_id,invited_email,invited_user_id,role,status,invited_at,accepted_at,invite_expires_at";

/**
 * Safe select for integration listings (sidebar cards, catalog grid). Excludes
 * `config` / `config_json` to keep OAuth tokens and API keys out of the browser
 * memory/DOM — defense in depth vs XSS token exfiltration (RLS already scopes
 * rows to the owner, so this is not a cross-tenant concern).
 *
 * Use `INTEGRATIONS_LIST_SELECT` only on detail/edit screens where the owner
 * explicitly needs to view or edit credentials.
 */
export const INTEGRATIONS_SAFE_SELECT =
  "id,user_id,store_id,name,type,is_active,last_sync_at,created_at,updated_at";

export const INTEGRATIONS_LIST_SELECT =
  "id,user_id,store_id,name,type,is_active,config,config_json,last_sync_at,created_at,updated_at";

export const WHITE_LABEL_SELECT =
  "id,user_id,brand_name,brand_logo_url,primary_color,custom_domain,support_email,support_whatsapp,hide_conversahub_branding,created_at,updated_at";

export const AFFILIATE_REFERRALS_SELECT =
  "id,referrer_id,referred_email,referred_user_id,status,commission_pct,commission_brl,plan_name,converted_at,paid_at,created_at";

export const NOTIFICATIONS_LIST_SELECT =
  "id,user_id,type,title,body,action_url,read_at,created_at";

export const API_KEYS_SAFE_SELECT =
  "id,user_id,name,key_prefix,key_preview,environment,scopes,last_used_at,expires_at,is_active,created_at";

export const LOYALTY_REWARDS_SELECT =
  "id,store_id,nome,descricao,tipo,custo_pontos,valor_beneficio,ativo,created_at";
