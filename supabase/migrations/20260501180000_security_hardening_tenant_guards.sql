-- 20260501180000_security_hardening_tenant_guards.sql
-- Hardens SECURITY DEFINER surface and removes permissive legacy policies.

-- 1) Remove duplicated permissive policy.
DROP POLICY IF EXISTS "system_config_read_all" ON public.system_config;

-- Keep authenticated-only read policy explicit and idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_config'
      AND policyname = 'system_config_read_auth'
  ) THEN
    CREATE POLICY "system_config_read_auth"
      ON public.system_config
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 2) Ensure has_role can be executed in anonymous contexts safely.
-- Function still returns false for non-authenticated callers.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- 3) SECURITY DEFINER functions must enforce tenant/owner assertions.
CREATE OR REPLACE FUNCTION public.get_advanced_reports_bundle_v2(p_store_id uuid, p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_heatmap JSONB;
  v_cohorts JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.get_loyalty_dashboard_bundle_v2(p_user_id uuid, p_rewards_store_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile JSONB;
  v_stats JSONB;
  v_rewards JSONB;
  v_stores JSONB;
BEGIN
  PERFORM public.assert_owner_access(p_user_id);
  IF p_rewards_store_id IS NOT NULL THEN
    PERFORM public.assert_store_access(p_rewards_store_id);
  END IF;

  SELECT jsonb_build_object(
    'loyalty_program_name', loyalty_program_name,
    'loyalty_slug', loyalty_slug,
    'points_per_real', points_per_real,
    'loyalty_program_enabled', loyalty_program_enabled,
    'loyalty_points_ttl_days', loyalty_points_ttl_days
  ) INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  SELECT jsonb_build_object(
    'members_with_balance', count(*) FILTER (WHERE points > 0),
    'total_points_balance', coalesce(sum(points), 0),
    'total_earned_sum', coalesce(sum(total_earned), 0),
    'total_redeemed_sum', coalesce(sum(total_redeemed), 0),
    'tier_counts', (
        SELECT jsonb_object_agg(tier, cnt)
        FROM (
            SELECT lower(coalesce(tier, 'bronze')) as tier, count(*) as cnt
            FROM public.loyalty_points
            WHERE user_id = p_user_id
            GROUP BY 1
        ) t
    )
  ) INTO v_stats
  FROM public.loyalty_points
  WHERE user_id = p_user_id;

  SELECT jsonb_agg(s) INTO v_stores
  FROM (
    SELECT id, name
    FROM public.stores
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
  ) s;

  IF p_rewards_store_id IS NOT NULL THEN
    SELECT jsonb_agg(r) INTO v_rewards
    FROM (
      SELECT id, store_id, nome, descricao, tipo, custo_pontos, valor_beneficio, ativo, created_at
      FROM public.loyalty_rewards
      WHERE store_id = p_rewards_store_id
      ORDER BY custo_pontos ASC
    ) r;
  ELSE
    v_rewards := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'stats', v_stats,
    'rewards', coalesce(v_rewards, '[]'::jsonb),
    'stores', coalesce(v_stores, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_operational_health_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_funil JSONB;
  v_quality JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT row_to_json(f.*) INTO v_funil
  FROM public.funil_diario f
  WHERE f.store_id = p_store_id
  ORDER BY f.data DESC
  LIMIT 1;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_review_stats(p_user_id uuid)
RETURNS TABLE(avg_rating numeric, negative_count bigint, pending_count bigint, platform_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_owner_access(p_user_id);

  RETURN QUERY
  SELECT
    coalesce(avg(rating)::numeric, 0),
    count(*) FILTER (WHERE rating <= 3),
    count(*) FILTER (WHERE status = 'pending'),
    count(distinct platform)
  FROM reviews
  WHERE user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.integration_health_summary(p_store_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  RETURN (
    SELECT json_build_object(
      'pending_count',
        (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'pending'),
      'processing_count',
        (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'processing'),
      'dead_letter_7d',
        (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'dead_letter' AND created_at > now() - interval '7 days'),
      'completed_7d',
        (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'completed' AND updated_at > now() - interval '7 days'),
      'avg_processing_ms',
        (SELECT coalesce(
          round(extract(epoch from avg(processed_at - created_at)) * 1000),
          0
        ) FROM webhook_queue WHERE store_id = p_store_id AND status = 'completed' AND processed_at IS NOT NULL AND created_at > now() - interval '7 days'),
      'last_success_at',
        (SELECT max(processed_at) FROM webhook_queue WHERE store_id = p_store_id AND status = 'completed')
    )
  );
END;
$function$;
