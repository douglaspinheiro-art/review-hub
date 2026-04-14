-- 20260424050000_performance_shield_phase3.sql
-- Phase 3 Performance Shield: Consolidated RPCs for Contacts, Campaigns, Prescriptions and RFM

-- 1. CONTACTS BUNDLE: Keyset Paginated List + RFM Report Counts
CREATE OR REPLACE FUNCTION public.get_contacts_bundle_v2(
  p_store_id UUID,
  p_search TEXT DEFAULT '',
  p_rfm_segment TEXT DEFAULT NULL,
  p_cursor_created_at TIMESTAMP DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfm_report JSONB;
  v_rows JSONB;
  v_total_count BIGINT;
  v_search_pattern TEXT;
  v_rfm_aliases TEXT[];
BEGIN
  -- 1. RFM Report Counts (Fixed for the whole store)
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

  -- 2. List with Filters and Keyset Pagination
  v_search_pattern := '%' || replace(replace(p_search, '%', '\%'), '_', '\_') || '%';
  
  -- Handle RFM segment aliases (English/Portuguese)
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

  -- Calculate total filtered count
  SELECT count(*) INTO v_total_count
  FROM public.customers_v3
  WHERE store_id = p_store_id
    AND (p_rfm_segment IS NULL OR rfm_segment = ANY(v_rfm_aliases))
    AND (p_search = '' OR (name ILIKE v_search_pattern OR email ILIKE v_search_pattern OR phone ILIKE v_search_pattern));

  -- Get rows
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
$$;

GRANT EXECUTE ON FUNCTION public.get_contacts_bundle_v2(UUID, TEXT, TEXT, TIMESTAMP, INT) TO authenticated;

-- 2. CAMPAIGNS BUNDLE: List with Integrated Metrics
CREATE OR REPLACE FUNCTION public.get_campaigns_bundle_v2(
  p_store_id UUID,
  p_status TEXT DEFAULT 'all',
  p_channel TEXT DEFAULT 'all',
  p_created_since TIMESTAMP DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  SELECT jsonb_agg(tmp) INTO v_rows
  FROM (
    SELECT 
      c.*,
      -- Subquery for metrics to keep it performant and avoids full-table join
      (
        SELECT jsonb_build_object(
          'sent', count(*) FILTER (WHERE status LIKE 'sent%'),
          'holdout', count(*) FILTER (WHERE status = 'holdout'),
          'suppressed_opt_out', count(*) FILTER (WHERE status = 'suppressed_opt_out'),
          'suppressed_cooldown', count(*) FILTER (WHERE status = 'suppressed_cooldown')
        )
        FROM public.message_sends ms
        WHERE ms.campaign_id = c.id
      ) as bundle_metrics,
      -- Subquery for attributed revenue
      (
        SELECT coalesce(sum(order_value::numeric), 0)
        FROM public.attribution_events ae
        WHERE ae.attributed_campaign_id = c.id
      ) as bundle_revenue
    FROM public.campaigns c
    WHERE c.store_id = p_store_id
      AND (p_status = 'all' OR c.status = p_status)
      AND (p_channel = 'all' OR c.channel = p_channel)
      AND (p_created_since IS NULL OR c.created_at >= p_created_since)
    ORDER BY c.created_at DESC
    LIMIT p_limit
  ) tmp;

  RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_bundle_v2(UUID, TEXT, TEXT, TIMESTAMP, INT) TO authenticated;

-- 3. PRESCRIPTIONS BUNDLE: List + Stats + Pending Impact
CREATE OR REPLACE FUNCTION public.get_prescriptions_bundle_v2(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
  v_stats JSONB;
BEGIN
  -- 1. List prescriptions with their opportunities (JSON join)
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

  -- 2. Summary stats for the page
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
$$;

GRANT EXECUTE ON FUNCTION public.get_prescriptions_bundle_v2(UUID) TO authenticated;

-- 4. RFM REPORT COUNTS: Server-side segment counting
CREATE OR REPLACE FUNCTION public.get_rfm_report_counts_v2(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfm_report JSONB;
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.get_rfm_report_counts_v2(UUID) TO authenticated;
