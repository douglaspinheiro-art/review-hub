-- =========================================================
-- FASE 1.1 + 1.2 — Multi-tenant lockdown nas RPCs sensíveis
-- =========================================================

-- Helpers de assert (idempotentes)
CREATE OR REPLACE FUNCTION public.assert_store_access(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: store_id required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id
      AND (s.user_id = auth.uid() OR public.auth_team_read_store(s.id))
  ) THEN
    RAISE EXCEPTION 'forbidden: store access denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_owner_access(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: user_id required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id <> auth.uid() AND NOT public.auth_team_read_owner(p_user_id) THEN
    RAISE EXCEPTION 'forbidden: owner access denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_store_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_owner_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_store_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_owner_access(uuid) TO authenticated;

-- =========================================================
-- get_ai_agent_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ai_agent_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config JSONB;
  v_recent_actions JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT row_to_json(cfg.*) INTO v_config
  FROM public.ai_agent_config cfg
  WHERE cfg.store_id = p_store_id
  LIMIT 1;

  SELECT jsonb_agg(a) INTO v_recent_actions
  FROM (
    SELECT id, action, resource, metadata, created_at
    FROM public.audit_logs
    WHERE store_id = p_store_id
      AND resource = 'ai_agent'
    ORDER BY created_at DESC
    LIMIT 20
  ) a;

  RETURN jsonb_build_object(
    'config', v_config,
    'recent_actions', coalesce(v_recent_actions, '[]'::jsonb)
  );
END;
$function$;

-- =========================================================
-- get_analytics_super_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_analytics_super_bundle_v2(p_store_id uuid, p_period_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot JSON;
  v_baseline JSON;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT public.get_dashboard_snapshot(p_store_id, p_period_days) INTO v_snapshot;
  SELECT public.get_conversion_baseline_summary(p_store_id, p_period_days) INTO v_baseline;

  RETURN jsonb_build_object(
    'snapshot', v_snapshot::jsonb,
    'baseline', v_baseline::jsonb
  );
END;
$function$;

-- =========================================================
-- get_automacoes_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_automacoes_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_journeys jsonb;
  v_counts jsonb;
  v_whatsapp_connected boolean;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(j)
  INTO v_journeys
  FROM (
    SELECT id, store_id, tipo_jornada, ativa, config_json, kpi_atual, updated_at
    FROM public.journeys_config
    WHERE store_id = p_store_id
    ORDER BY tipo_jornada
  ) j;

  SELECT jsonb_object_agg(journey_id, sent_count)
  INTO v_counts
  FROM (
    SELECT sm.journey_id,
           COUNT(*)::bigint AS sent_count
    FROM public.scheduled_messages sm
    WHERE sm.store_id = p_store_id
      AND sm.status = 'sent'
      AND sm.journey_id IS NOT NULL
    GROUP BY sm.journey_id
  ) c;

  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_connections
    WHERE store_id = p_store_id
      AND status = 'connected'
  ) INTO v_whatsapp_connected;

  RETURN jsonb_build_object(
    'journeys', coalesce(v_journeys, '[]'::jsonb),
    'counts', coalesce(v_counts, '{}'::jsonb),
    'whatsapp_connected', v_whatsapp_connected
  );
END;
$function$;

-- =========================================================
-- get_campaigns_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_campaigns_bundle_v2(p_store_id uuid, p_status text DEFAULT 'all'::text, p_channel text DEFAULT 'all'::text, p_created_since timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(tmp) INTO v_rows
  FROM (
    SELECT
      c.*,
      (
        SELECT jsonb_build_object(
          'sent', coalesce(sum(CASE WHEN ms.status = 'sent' OR ms.status = 'delivered' OR ms.status = 'read' OR ms.status = 'replied' THEN 1 ELSE 0 END), 0),
          'holdout', coalesce(sum(CASE WHEN ms.status = 'holdout' THEN 1 ELSE 0 END), 0),
          'suppressed_opt_out', coalesce(sum(CASE WHEN ms.status = 'suppressed_opt_out' THEN 1 ELSE 0 END), 0),
          'suppressed_cooldown', coalesce(sum(CASE WHEN ms.status = 'suppressed_cooldown' THEN 1 ELSE 0 END), 0)
        )
        FROM public.message_sends ms
        WHERE ms.campaign_id = c.id
      ) as bundle_metrics,
      (
        SELECT coalesce(sum(order_value::numeric), 0)
        FROM public.attribution_events ae
        WHERE ae.attributed_campaign_id = c.id
      ) as bundle_revenue
    FROM public.campaigns c
    WHERE c.store_id = p_store_id
      AND (
        (p_status = 'all' AND c.status != 'archived') 
        OR (p_status != 'all' AND c.status = p_status)
      )
      AND (p_channel = 'all' OR c.channel = p_channel)
      AND (p_created_since IS NULL OR c.created_at >= p_created_since)
    ORDER BY c.created_at DESC
    LIMIT p_limit
  ) tmp;

  RETURN coalesce(v_rows, '[]'::jsonb);
END;
$function$;

-- =========================================================
-- get_contacts_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_contacts_bundle_v2(p_store_id uuid, p_search text DEFAULT ''::text, p_rfm_segment text DEFAULT NULL::text, p_cursor_created_at timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rfm_report JSONB;
  v_rows JSONB;
  v_total_count BIGINT;
  v_search_pattern TEXT;
  v_rfm_aliases TEXT[];
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_build_object(
    'champions', count(*) FILTER (WHERE rfm_segment IN ('champions', 'Campeões')),
    'loyal', count(*) FILTER (WHERE rfm_segment IN ('loyal', 'Fiéis')),
    'promising', count(*) FILTER (WHERE rfm_segment IN ('promising', 'Promissores')),
    'new', count(*) FILTER (WHERE rfm_segment IN ('new', 'Novos')),
    'at_risk', count(*) FILTER (WHERE rfm_segment IN ('at_risk', 'Em risco')),
    'lost', count(*) FILTER (WHERE rfm_segment IN ('lost', 'Perdidos')),
    'other', count(*) FILTER (WHERE rfm_segment NOT IN ('champions', 'Campeões', 'loyal', 'Fiéis', 'promising', 'Promissores', 'new', 'Novos', 'at_risk', 'Em risco', 'lost', 'Perdidos') OR rfm_segment IS NULL),
    'total', count(*),
    'avg_chs', coalesce(avg(customer_health_score), 0)
  ) INTO v_rfm_report
  FROM public.customers_v3
  WHERE store_id = p_store_id;

  v_search_pattern := '%' || replace(replace(p_search, '%', '\%'), '_', '\_') || '%';

  IF p_rfm_segment IS NOT NULL THEN
    v_rfm_aliases := CASE p_rfm_segment
      WHEN 'champions' THEN ARRAY['champions', 'Campeões']
      WHEN 'loyal' THEN ARRAY['loyal', 'Fiéis']
      WHEN 'promising' THEN ARRAY['promising', 'Promissores']
      WHEN 'new' THEN ARRAY['new', 'Novos']
      WHEN 'at_risk' THEN ARRAY['at_risk', 'Em risco']
      WHEN 'lost' THEN ARRAY['lost', 'Perdidos']
      ELSE ARRAY[p_rfm_segment]
    END;
  END IF;

  SELECT count(*) INTO v_total_count
  FROM public.customers_v3
  WHERE store_id = p_store_id
    AND (p_rfm_segment IS NULL OR rfm_segment = ANY(v_rfm_aliases))
    AND (p_search = '' OR (name ILIKE v_search_pattern OR email ILIKE v_search_pattern OR phone ILIKE v_search_pattern));

  SELECT jsonb_agg(c) INTO v_rows
  FROM (
    SELECT id, store_id, name, email, phone, rfm_segment, tags, last_purchase_at, customer_health_score, created_at, rfm_frequency, rfm_monetary
    FROM public.customers_v3
    WHERE store_id = p_store_id
      AND (p_rfm_segment IS NULL OR rfm_segment = ANY(v_rfm_aliases))
      AND (p_search = '' OR (name ILIKE v_search_pattern OR email ILIKE v_search_pattern OR phone ILIKE v_search_pattern))
      AND (p_cursor_created_at IS NULL OR created_at < p_cursor_created_at)
    ORDER BY created_at DESC
    LIMIT p_limit
  ) c;

  RETURN jsonb_build_object(
    'rfm_report', v_rfm_report,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total_count', v_total_count
  );
END;
$function$;

-- =========================================================
-- get_dashboard_snapshot
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(p_store_id uuid, p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_since timestamptz := now() - (p_period_days || ' days')::interval;
  v_prev_since timestamptz := now() - (p_period_days * 2 || ' days')::interval;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_build_object(
    'analytics', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(revenue_influenced), 0),
        'messages_sent', COALESCE(SUM(messages_sent), 0),
        'messages_delivered', COALESCE(SUM(messages_delivered), 0),
        'messages_read', COALESCE(SUM(messages_read), 0),
        'new_contacts', COALESCE(SUM(new_contacts), 0)
      )
      FROM analytics_daily
      WHERE store_id = p_store_id AND date >= v_since::date
    ),
    'analytics_prev', (
      SELECT jsonb_build_object(
        'revenue', COALESCE(SUM(revenue_influenced), 0)
      )
      FROM analytics_daily
      WHERE store_id = p_store_id AND date >= v_prev_since::date AND date < v_since::date
    ),
    'active_campaigns', (
      SELECT COUNT(*) FROM campaigns
      WHERE store_id = p_store_id AND status IN ('running', 'scheduled')
    ),
    'open_conversations', (
      SELECT COUNT(*) FROM conversations
      WHERE store_id = p_store_id AND status = 'open'
    ),
    'total_unread', (
      SELECT COALESCE(SUM(unread_count), 0) FROM conversations
      WHERE store_id = p_store_id AND status = 'open'
    ),
    'total_contacts', (
      SELECT COUNT(*) FROM contacts WHERE store_id = p_store_id
    ),
    'store', (
      SELECT jsonb_build_object(
        'id', s.id, 'name', s.name, 'segment', s.segment,
        'conversion_health_score', s.conversion_health_score,
        'chs_history', s.chs_history
      )
      FROM stores s WHERE s.id = p_store_id
    ),
    'recent_campaigns', (
      SELECT COALESCE(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.updated_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, name, status, channel, sent_count, delivered_count, read_count, reply_count, total_contacts, updated_at
        FROM campaigns WHERE store_id = p_store_id ORDER BY updated_at DESC LIMIT 5
      ) c
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- =========================================================
-- get_execution_monitor_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_execution_monitor_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prescriptions JSONB;
  v_campaigns JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(p) INTO v_prescriptions
  FROM (
    SELECT id, title, status, execution_channel, detected_at, estimated_potential, estimated_roi
    FROM public.prescriptions
    WHERE store_id = p_store_id AND status IN ('em_execucao', 'pausada')
    ORDER BY created_at DESC
  ) p;

  SELECT jsonb_agg(c) INTO v_campaigns
  FROM (
    SELECT 
      cam.id, cam.name, cam.status, cam.channel, cam.source_prescription_id,
      cam.sent_count, cam.delivered_count, cam.read_count, cam.reply_count, cam.total_contacts,
      cam.ab_test_id,
      (SELECT winner_variant FROM public.ab_tests WHERE id = cam.ab_test_id) as winner_variant
    FROM public.campaigns cam
    WHERE cam.store_id = p_store_id 
      AND cam.source_prescription_id IN (
        SELECT id FROM public.prescriptions WHERE store_id = p_store_id AND status IN ('em_execucao', 'pausada')
      )
  ) c;

  RETURN jsonb_build_object(
    'prescriptions', coalesce(v_prescriptions, '[]'::jsonb),
    'campaigns', coalesce(v_campaigns, '[]'::jsonb)
  );
END;
$function$;

-- =========================================================
-- get_funil_page_data
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_funil_page_data(p_store_id uuid, p_period text DEFAULT '30d'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days INT;
  v_since TIMESTAMP;
  v_result JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  v_days := CASE 
    WHEN p_period = '7d' THEN 7 
    WHEN p_period = '90d' THEN 90 
    ELSE 30 
  END;
  v_since := now() - (v_days || ' days')::interval;

  WITH 
  loja_info AS (
    SELECT id, name, segment, ticket_medio, meta_conversao, pix_key
    FROM stores
    WHERE id = p_store_id
  ),
  metricas_funil AS (
    SELECT source, last_ingested_at, last_manual_updated_at, metricas
    FROM funil_page_metricas
    WHERE store_id = p_store_id AND periodo = p_period
    ORDER BY created_at DESC LIMIT 1
  ),
  metricas_enriquecidas AS (
    SELECT receita_travada_frete, receita_travada_pagamento, total_abandonos_frete, total_abandonos_pagamento
    FROM metricas_enriquecidas
    WHERE store_id = p_store_id AND periodo = p_period
    ORDER BY created_at DESC LIMIT 1
  ),
  saude_dados AS (
    SELECT score, status, alertas, recomendacoes_confiaveis, metric_contract, canais, etapas
    FROM data_health_v3
    WHERE store_id = p_store_id AND periodo = p_period
    ORDER BY created_at DESC LIMIT 1
  ),
  ultimo_diag AS (
    SELECT id, created_at, resumo, score, taxa_conversao
    FROM diagnostics_v3
    WHERE store_id = p_store_id
    ORDER BY created_at DESC LIMIT 1
  ),
  todos_diags AS (
    SELECT id, created_at, taxa_conversao, score
    FROM diagnostics_v3
    WHERE store_id = p_store_id
    ORDER BY created_at DESC LIMIT 10
  ),
  top_produtos AS (
    SELECT id, nome, sku, preco, estoque, taxa_conversao_produto, receita_30d
    FROM products
    WHERE store_id = p_store_id
    ORDER BY taxa_conversao_produto ASC
    LIMIT 5
  ),
  metrics_v3 AS (
    SELECT mobile_visitors, mobile_orders, desktop_visitors, desktop_orders, mobile_cvr, desktop_cvr
    FROM funnel_metrics_v3
    WHERE store_id = p_store_id
    ORDER BY created_at DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'loja', (SELECT row_to_json(loja_info) FROM loja_info),
    'funil_metricas', (SELECT row_to_json(metricas_funil) FROM metricas_funil),
    'enriquecidas', (SELECT row_to_json(metricas_enriquecidas) FROM metricas_enriquecidas),
    'data_health', (SELECT row_to_json(saude_dados) FROM saude_dados),
    'ultimo_diagnostico', (SELECT row_to_json(ultimo_diag) FROM ultimo_diag),
    'historico_diagnosticos', (SELECT json_agg(todos_diags) FROM todos_diags),
    'produtos', (SELECT json_agg(top_produtos) FROM top_produtos),
    'metrics_v3', (SELECT row_to_json(metrics_v3) FROM metrics_v3)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- =========================================================
-- get_inbox_chat_bundle_v2 — guarda via store da conversa
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_inbox_chat_bundle_v2(p_conversation_id uuid, p_messages_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation JSONB;
  v_messages JSONB;
  v_contact JSONB;
  v_store_id UUID;
BEGIN
  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: conversation_id required' USING ERRCODE = '42501';
  END IF;

  -- Resolver store da conversa via contact
  SELECT ct.store_id INTO v_store_id
  FROM public.conversations c
  JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.id = p_conversation_id;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Conversation not found');
  END IF;

  PERFORM public.assert_store_access(v_store_id);

  SELECT row_to_json(c.*) INTO v_conversation
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  SELECT row_to_json(con.*) INTO v_contact
  FROM public.contacts con
  WHERE con.id = (v_conversation->>'contact_id')::uuid;

  SELECT jsonb_agg(m) INTO v_messages
  FROM (
    SELECT id, conversation_id, content, created_at, direction, status, type, external_id, user_id, metadata
    FROM public.messages
    WHERE conversation_id = p_conversation_id
    ORDER BY created_at DESC
    LIMIT p_messages_limit
  ) m;

  RETURN jsonb_build_object(
    'conversation', v_conversation,
    'contact', v_contact,
    'messages', coalesce(v_messages, '[]'::jsonb),
    'notes', (
      SELECT jsonb_agg(n) FROM (
        SELECT id, conversation_id, user_id, note, created_at
        FROM public.conversation_notes
        WHERE conversation_id = p_conversation_id
        ORDER BY created_at DESC
        LIMIT 20
      ) n
    )
  );
END;
$function$;

-- =========================================================
-- get_prescriptions_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_prescriptions_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows JSONB;
  v_stats JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(tmp) INTO v_rows
  FROM (
    SELECT 
      p.*,
      row_to_json(o.*) as opportunity
    FROM public.prescriptions p
    LEFT JOIN public.opportunities o ON o.id = p.opportunity_id
    WHERE p.store_id = p_store_id
    ORDER BY p.created_at DESC
    LIMIT 50
  ) tmp;

  SELECT jsonb_build_object(
    'total_impact', coalesce(sum(estimated_potential) FILTER (WHERE status != 'rejeitada'), 0),
    'pending_count', count(*) FILTER (WHERE status = 'aguardando_aprovacao'),
    'pending_value', coalesce(sum(estimated_potential) FILTER (WHERE status = 'aguardando_aprovacao'), 0)
  ) INTO v_stats
  FROM public.prescriptions
  WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'stats', v_stats
  );
END;
$function$;

-- =========================================================
-- get_reviews_bundle_v2 (escopo por owner)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_reviews_bundle_v2(p_user_id uuid, p_filter text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_cursor_created_at timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stats JSONB;
  v_rows JSONB;
  v_total_count BIGINT;
  v_search_pattern TEXT;
BEGIN
  PERFORM public.assert_owner_access(p_user_id);

  SELECT jsonb_build_object(
    'avg_rating', coalesce(avg(rating), 0),
    'negative_count', count(*) FILTER (WHERE rating <= 3),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'platform_count', count(DISTINCT platform)
  ) INTO v_stats
  FROM public.reviews
  WHERE user_id = p_user_id;

  v_search_pattern := '%' || p_search || '%';

  SELECT count(*) INTO v_total_count
  FROM public.reviews
  WHERE user_id = p_user_id
    AND (p_filter = 'all' OR (p_filter = 'pending' AND status = 'pending') OR (p_filter = 'negative' AND rating <= 3))
    AND (p_search = '' OR (reviewer_name ILIKE v_search_pattern OR content ILIKE v_search_pattern));

  SELECT jsonb_agg(r) INTO v_rows
  FROM (
    SELECT id, platform, rating, reviewer_name, content, status, url, ai_reply, replied_at, created_at, updated_at
    FROM public.reviews
    WHERE user_id = p_user_id
      AND (p_filter = 'all' OR (p_filter = 'pending' AND status = 'pending') OR (p_filter = 'negative' AND rating <= 3))
      AND (p_search = '' OR (reviewer_name ILIKE v_search_pattern OR content ILIKE v_search_pattern))
      AND (p_cursor_created_at IS NULL OR created_at < p_cursor_created_at)
    ORDER BY created_at DESC
    LIMIT p_limit
  ) r;

  RETURN jsonb_build_object(
    'stats', v_stats,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total_count', v_total_count
  );
END;
$function$;

-- =========================================================
-- get_rfm_report_counts_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_rfm_report_counts_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rfm_report JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_build_object(
    'champions', count(*) FILTER (WHERE rfm_segment IN ('champions', 'Campeões')),
    'loyal', count(*) FILTER (WHERE rfm_segment IN ('loyal', 'Fiéis')),
    'promising', count(*) FILTER (WHERE rfm_segment IN ('promising', 'Promissores')),
    'new', count(*) FILTER (WHERE rfm_segment IN ('new', 'Novos')),
    'at_risk', count(*) FILTER (WHERE rfm_segment IN ('at_risk', 'Em risco')),
    'lost', count(*) FILTER (WHERE rfm_segment IN ('lost', 'Perdidos')),
    'other', count(*) FILTER (WHERE rfm_segment NOT IN ('champions', 'Campeões', 'loyal', 'Fiéis', 'promising', 'Promissores', 'new', 'Novos', 'at_risk', 'Em risco', 'lost', 'Perdidos') OR rfm_segment IS NULL),
    'total', count(*),
    'avg_chs', coalesce(avg(customer_health_score), 0)
  ) INTO v_rfm_report
  FROM public.customers_v3
  WHERE store_id = p_store_id;

  RETURN v_rfm_report;
END;
$function$;

-- =========================================================
-- get_roi_attribution_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_roi_attribution_bundle_v2(p_store_id uuid, p_period_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since DATE;
  v_prev_since DATE;
  v_since_iso TIMESTAMP;
  v_total_revenue NUMERIC;
  v_prev_revenue NUMERIC;
  v_rev_growth_pct INT;
  v_campaign_rev NUMERIC;
  v_automation_rev NUMERIC;
  v_total_spend NUMERIC;
  v_carts JSONB;
  v_by_campaign JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  v_since := (CURRENT_DATE - p_period_days);
  v_prev_since := (CURRENT_DATE - (p_period_days * 2));
  v_since_iso := CURRENT_TIMESTAMP - (p_period_days || ' days')::interval;

  SELECT coalesce(sum(revenue_influenced), 0) INTO v_total_revenue
  FROM public.analytics_daily WHERE store_id = p_store_id AND date >= v_since;

  SELECT coalesce(sum(revenue_influenced), 0) INTO v_prev_revenue
  FROM public.analytics_daily WHERE store_id = p_store_id AND date >= v_prev_since AND date < v_since;

  IF v_prev_revenue > 0 THEN
    v_rev_growth_pct := round(((v_total_revenue - v_prev_revenue) / v_prev_revenue) * 100);
  ELSE
    v_rev_growth_pct := 0;
  END IF;

  SELECT 
    coalesce(sum(order_value::numeric) FILTER (WHERE attributed_campaign_id IS NOT NULL), 0),
    coalesce(sum(order_value::numeric) FILTER (WHERE attributed_automation_id IS NOT NULL AND attributed_campaign_id IS NULL), 0)
  INTO v_campaign_rev, v_automation_rev
  FROM public.attribution_events ae
  JOIN public.campaigns c ON c.id = ae.attributed_campaign_id
  WHERE c.store_id = p_store_id AND ae.order_date >= v_since_iso;

  SELECT coalesce(sum(custo_total_envio), 0) INTO v_total_spend
  FROM public.campaigns WHERE store_id = p_store_id AND created_at >= v_since_iso;

  SELECT jsonb_agg(tmp) INTO v_by_campaign
  FROM (
    SELECT 
      c.id, c.name, c.channel,
      sum(ae.order_value::numeric) as revenue,
      count(ae.id) as conversions,
      coalesce(c.sent_count, 0) as sent
    FROM public.campaigns c
    JOIN public.attribution_events ae ON ae.attributed_campaign_id = c.id
    WHERE c.store_id = p_store_id AND ae.order_date >= v_since_iso
    GROUP BY c.id, c.name, c.channel, c.sent_count
    ORDER BY revenue DESC
    LIMIT 20
  ) tmp;

  SELECT jsonb_build_object(
    'total', count(*),
    'recovered', count(*) FILTER (WHERE status = 'recovered'),
    'recovery_rate', CASE WHEN count(*) > 0 THEN round((count(*) FILTER (WHERE status = 'recovered')::numeric / count(*)) * 100) ELSE 0 END,
    'recovered_value', coalesce(sum(cart_value) FILTER (WHERE status = 'recovered'), 0)
  ) INTO v_carts
  FROM public.abandoned_carts
  WHERE store_id = p_store_id AND created_at >= v_since_iso;

  RETURN jsonb_build_object(
    'total_revenue', v_total_revenue,
    'rev_growth_pct', v_rev_growth_pct,
    'total_spend', v_total_spend,
    'roas', CASE WHEN v_total_spend > 0 THEN round((v_total_revenue / v_total_spend)::numeric, 2) ELSE NULL END,
    'source_breakdown', jsonb_build_object(
      'campaigns', v_campaign_rev,
      'automations', v_automation_rev,
      'direct', greatest(0, v_total_revenue - (v_campaign_rev + v_automation_rev))
    ),
    'by_campaign', coalesce(v_by_campaign, '[]'::jsonb),
    'cart_stats', v_carts,
    'timestamp', now()
  );
END;
$function$;

-- =========================================================
-- get_whatsapp_bundle_v2
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_whatsapp_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_connections JSONB;
  v_health_summary JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(c) INTO v_connections
  FROM (
    SELECT id, instance_name, phone_number, status, provider, meta_phone_number_id, meta_waba_id, meta_default_template_name, connected_at, created_at, store_id
    FROM public.whatsapp_connections
    WHERE store_id = p_store_id
    ORDER BY created_at DESC
  ) c;

  SELECT jsonb_build_object(
    'recent_errors', (
      SELECT jsonb_agg(l) FROM (
        SELECT id, created_at, event_type, status, error_message
        FROM public.webhook_logs
        WHERE (metadata->>'store_id')::uuid = p_store_id
          AND status = 'error'
          AND event_type ILIKE '%whatsapp%'
        ORDER BY created_at DESC
        LIMIT 10
      ) l
    ),
    'total_connected', count(*) FILTER (WHERE status = 'connected')
  ) INTO v_health_summary
  FROM public.whatsapp_connections
  WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'connections', coalesce(v_connections, '[]'::jsonb),
    'health', v_health_summary
  );
END;
$function$;

-- =========================================================
-- search_conversation_ids_by_message — limitar a stores acessíveis
-- =========================================================
CREATE OR REPLACE FUNCTION public.search_conversation_ids_by_message(p_search text)
RETURNS TABLE(conversation_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT m.conversation_id
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  JOIN public.contacts ct ON ct.id = c.contact_id
  JOIN public.stores s ON s.id = ct.store_id
  WHERE to_tsvector('simple', m.content) @@ websearch_to_tsquery('simple', p_search)
    AND (s.user_id = auth.uid() OR public.auth_team_read_store(s.id))
  LIMIT 1000;
$function$;

-- =========================================================
-- 1.2 — Revogar EXECUTE de PUBLIC/anon nas RPCs sensíveis
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.get_ai_agent_bundle_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_analytics_super_bundle_v2(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_automacoes_bundle_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_campaigns_bundle_v2(uuid, text, text, timestamp without time zone, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_contacts_bundle_v2(uuid, text, text, timestamp without time zone, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_execution_monitor_bundle_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_funil_page_data(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_inbox_chat_bundle_v2(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_prescriptions_bundle_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_reviews_bundle_v2(uuid, text, text, timestamp without time zone, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_rfm_report_counts_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_roi_attribution_bundle_v2(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_bundle_v2(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_abandoned_carts_v2(uuid, timestamp without time zone, text, timestamp without time zone, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_conversation_ids_by_message(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_ai_agent_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_super_bundle_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_automacoes_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaigns_bundle_v2(uuid, text, text, timestamp without time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contacts_bundle_v2(uuid, text, text, timestamp without time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_execution_monitor_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_funil_page_data(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox_chat_bundle_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prescriptions_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reviews_bundle_v2(uuid, text, text, timestamp without time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rfm_report_counts_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_roi_attribution_bundle_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abandoned_carts_v2(uuid, timestamp without time zone, text, timestamp without time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_conversation_ids_by_message(text) TO authenticated;