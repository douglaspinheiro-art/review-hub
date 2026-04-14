-- 20260424070000_performance_shield_phase5.sql
-- Phase 5 Performance Shield: Advanced RPCs for ROI, Execution Monitor, Operations and Reports

-- 1. ROI ATTRIBUTION BUNDLE: Full math inside Postgres
CREATE OR REPLACE FUNCTION public.get_roi_attribution_bundle_v2(
  p_store_id UUID,
  p_period_days INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_attribution JSONB;
  v_carts JSONB;
  v_by_campaign JSONB;
BEGIN
  v_since := (CURRENT_DATE - p_period_days);
  v_prev_since := (CURRENT_DATE - (p_period_days * 2));
  v_since_iso := CURRENT_TIMESTAMP - (p_period_days || ' days')::interval;

  -- 1. Total Revenue and Growth
  SELECT coalesce(sum(revenue_influenced), 0) INTO v_total_revenue
  FROM public.analytics_daily WHERE store_id = p_store_id AND date >= v_since;

  SELECT coalesce(sum(revenue_influenced), 0) INTO v_prev_revenue
  FROM public.analytics_daily WHERE store_id = p_store_id AND date >= v_prev_since AND date < v_since;

  IF v_prev_revenue > 0 THEN
    v_rev_growth_pct := round(((v_total_revenue - v_prev_revenue) / v_prev_revenue) * 100);
  ELSE
    v_rev_growth_pct := 0;
  END IF;

  -- 2. Attribution Breakdown
  SELECT 
    coalesce(sum(order_value::numeric) FILTER (WHERE attributed_campaign_id IS NOT NULL), 0),
    coalesce(sum(order_value::numeric) FILTER (WHERE attributed_automation_id IS NOT NULL AND attributed_campaign_id IS NULL), 0)
  INTO v_campaign_rev, v_automation_rev
  FROM public.attribution_events ae
  JOIN public.campaigns c ON c.id = ae.attributed_campaign_id
  WHERE c.store_id = p_store_id AND ae.order_date >= v_since_iso;

  -- 3. Spend & ROAS
  SELECT coalesce(sum(custo_total_envio), 0) INTO v_total_spend
  FROM public.campaigns WHERE store_id = p_store_id AND created_at >= v_since_iso;

  -- 4. By Campaign Detail
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

  -- 5. Cart Recovery Stats
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
      'direct', max(0, v_total_revenue - (v_campaign_rev + v_automation_rev))
    ),
    'by_campaign', coalesce(v_by_campaign, '[]'::jsonb),
    'cart_stats', v_carts,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_roi_attribution_bundle_v2(UUID, INT) TO authenticated;

-- 2. EXECUTION MONITOR BUNDLE: Running items + Metrics
CREATE OR REPLACE FUNCTION public.get_execution_monitor_bundle_v2(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescriptions JSONB;
  v_campaigns JSONB;
BEGIN
  -- 1. Get in-execution prescriptions
  SELECT jsonb_agg(p) INTO v_prescriptions
  FROM (
    SELECT id, title, status, execution_channel, detected_at, estimated_potential, estimated_roi
    FROM public.prescriptions
    WHERE store_id = p_store_id AND status IN ('em_execucao', 'pausada')
    ORDER BY created_at DESC
  ) p;

  -- 2. Get campaigns linked to these prescriptions with current metrics
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
$$;

GRANT EXECUTE ON FUNCTION public.get_execution_monitor_bundle_v2(UUID) TO authenticated;

-- 3. OPERATIONAL HEALTH BUNDLE
CREATE OR REPLACE FUNCTION public.get_operational_health_bundle_v2(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funil JSONB;
  v_quality JSONB;
BEGIN
  -- Latest Funnel Row
  SELECT row_to_json(f.*) INTO v_funil
  FROM public.funil_diario f
  WHERE f.store_id = p_store_id
  ORDER BY f.data DESC
  LIMIT 1;

  -- Latest Data Quality
  SELECT row_to_json(q.*) INTO v_quality
  FROM public.data_quality q
  WHERE q.store_id = p_store_id
  ORDER BY q.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'funil', v_funil,
    'quality', v_quality,
    'webhook_stats', jsonb_build_object(
      'failures_48h', (SELECT count(*) FROM public.webhook_logs WHERE (metadata->>'store_id')::uuid = p_store_id AND status = 'error' AND created_at > now() - interval '48 hours'),
      'stale_48h', (SELECT count(*) FROM public.webhook_logs WHERE (metadata->>'store_id')::uuid = p_store_id AND status IN ('pending', 'received') AND created_at > now() - interval '48 hours' AND created_at < now() - interval '1 hour')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operational_health_bundle_v2(UUID) TO authenticated;

-- 4. ADVANCED REPORTS BUNDLE: Heatmap + Cohorts
CREATE OR REPLACE FUNCTION public.get_advanced_reports_bundle_v2(
  p_store_id UUID,
  p_period_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_heatmap JSONB;
  v_cohorts JSONB;
BEGIN
  -- 1. Generate Heatmap Server-side (last N days)
  WITH hourly_data AS (
    SELECT 
      CASE WHEN extract(dow from sent_at) = 0 THEN 6 ELSE extract(dow from sent_at)::int - 1 END as dow,
      CASE 
        WHEN extract(hour from sent_at) < 11 THEN '08h'
        WHEN extract(hour from sent_at) < 15 THEN '12h'
        ELSE '18h'
      END as bucket
    FROM public.message_sends
    WHERE store_id = p_store_id AND sent_at > now() - (p_period_days || ' days')::interval
  ),
  aggregated AS (
    SELECT dow, bucket, count(*)::int as val
    FROM hourly_data
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'cells', (SELECT jsonb_object_agg(dow || '-' || bucket, val) FROM aggregated),
    'max_val', coalesce((SELECT max(val) FROM aggregated), 0)
  ) INTO v_heatmap;

  -- 2. Get Cohorts
  SELECT jsonb_agg(c) INTO v_cohorts
  FROM (
    SELECT id, cohort_month, cohort_size, retention_d30, computed_at
    FROM public.customer_cohorts
    WHERE store_id = p_store_id
    ORDER BY cohort_month DESC
    LIMIT 24
  ) c;

  RETURN jsonb_build_object(
    'heatmap', v_heatmap,
    'cohorts', coalesce(v_cohorts, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_advanced_reports_bundle_v2(UUID, INT) TO authenticated;
