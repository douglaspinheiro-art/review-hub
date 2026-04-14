-- 20260424040000_performance_shield_phase2.sql
-- Phase 2 Performance Shield: Consolidated RPCs and Keyset Pagination for Loyalty and Reviews

-- 1. LOYALTY TRANSACTIONS: Keyset Pagination with Contact Join
CREATE OR REPLACE FUNCTION public.get_loyalty_transactions_v2(
  p_user_id UUID,
  p_cursor_created_at TIMESTAMP DEFAULT NULL,
  p_limit INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
  v_total_count BIGINT;
BEGIN
  -- Total count for the user (fast with index)
  SELECT count(*) INTO v_total_count
  FROM public.loyalty_transactions
  WHERE user_id = p_user_id;

  -- Page rows with join on server side
  SELECT jsonb_agg(tmp) INTO v_rows
  FROM (
    SELECT 
      lt.id,
      lt.contact_id,
      lt.points,
      lt.reason,
      lt.description,
      lt.reference_id,
      lt.created_at,
      coalesce(c.name, '—') as contact_name,
      coalesce(c.phone, '') as contact_phone
    FROM public.loyalty_transactions lt
    LEFT JOIN public.contacts c ON c.id = lt.contact_id
    WHERE lt.user_id = p_user_id
      AND (p_cursor_created_at IS NULL OR lt.created_at < p_cursor_created_at)
    ORDER BY lt.created_at DESC
    LIMIT p_limit
  ) tmp;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total_count', v_total_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_loyalty_transactions_v2(UUID, TIMESTAMP, INT) TO authenticated;

-- 2. LOYALTY DASHBOARD BUNDLE: Profile + Stats + Stores + Rewards
CREATE OR REPLACE FUNCTION public.get_loyalty_dashboard_bundle_v2(
  p_user_id UUID,
  p_rewards_store_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile JSONB;
  v_stats JSONB;
  v_rewards JSONB;
  v_stores JSONB;
BEGIN
  -- Profile Config
  SELECT jsonb_build_object(
    'loyalty_program_name', loyalty_program_name,
    'loyalty_slug', loyalty_slug,
    'points_per_real', points_per_real,
    'loyalty_program_enabled', loyalty_program_enabled,
    'loyalty_points_ttl_days', loyalty_points_ttl_days
  ) INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- Aggregated Stats
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

  -- Store List (Brief)
  SELECT jsonb_agg(s) INTO v_stores
  FROM (
    SELECT id, name
    FROM public.stores
    WHERE user_id = p_user_id
    ORDER BY created_at ASC
  ) s;

  -- Rewards for specific store
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
$$;

GRANT EXECUTE ON FUNCTION public.get_loyalty_dashboard_bundle_v2(UUID, UUID) TO authenticated;

-- 3. REVIEWS BUNDLE: Stats + Keyset Pagination List
CREATE OR REPLACE FUNCTION public.get_reviews_bundle_v2(
  p_user_id UUID,
  p_filter TEXT DEFAULT 'all',
  p_search TEXT DEFAULT '',
  p_cursor_created_at TIMESTAMP DEFAULT NULL,
  p_limit INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSONB;
  v_rows JSONB;
  v_total_count BIGINT;
  v_search_pattern TEXT;
BEGIN
  -- 1. Stats
  SELECT jsonb_build_object(
    'avg_rating', coalesce(avg(rating), 0),
    'negative_count', count(*) FILTER (WHERE rating <= 3),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'platform_count', count(DISTINCT platform)
  ) INTO v_stats
  FROM public.reviews
  WHERE user_id = p_user_id;

  -- 2. List with Filters and Keyset Pagination
  v_search_pattern := '%' || p_search || '%';
  
  -- Calculate total filtered count
  SELECT count(*) INTO v_total_count
  FROM public.reviews
  WHERE user_id = p_user_id
    AND (p_filter = 'all' OR (p_filter = 'pending' AND status = 'pending') OR (p_filter = 'negative' AND rating <= 3))
    AND (p_search = '' OR (reviewer_name ILIKE v_search_pattern OR content ILIKE v_search_pattern));

  -- Get rows
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
$$;

GRANT EXECUTE ON FUNCTION public.get_reviews_bundle_v2(UUID, TEXT, TEXT, TIMESTAMP, INT) TO authenticated;

-- 4. ANALYTICS SUPER BUNDLE: Snapshot + Baseline Summary
CREATE OR REPLACE FUNCTION public.get_analytics_super_bundle_v2(
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
  v_snapshot JSON;
  v_baseline JSON;
BEGIN
  -- 1. Get snapshot (existing RPC)
  SELECT public.get_dashboard_snapshot(p_store_id, p_period_days) INTO v_snapshot;
  
  -- 2. Get baseline summary (existing RPC)
  SELECT public.get_conversion_baseline_summary(p_store_id, p_period_days) INTO v_baseline;

  RETURN jsonb_build_object(
    'snapshot', v_snapshot::jsonb,
    'baseline', v_baseline::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_super_bundle_v2(UUID, INT) TO authenticated;
