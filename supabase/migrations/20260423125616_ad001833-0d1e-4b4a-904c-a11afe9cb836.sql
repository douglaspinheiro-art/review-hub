CREATE OR REPLACE FUNCTION public.get_ltv_summary_v1(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_avg_ltv_12m numeric := 0;
  v_avg_ltv_lifetime numeric := 0;
  v_rpr numeric := 0;
  v_avg_days_between numeric := 0;
  v_total_customers integer := 0;
  v_repeat_customers integer := 0;
  v_cohorts jsonb := '[]'::jsonb;
BEGIN
  -- Authorization: must own the store or be a team reader
  SELECT user_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'store not found';
  END IF;
  IF v_owner <> v_uid AND NOT public.auth_team_read_store(p_store_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Lifetime average LTV (rfm_monetary aggregate)
  SELECT COALESCE(AVG(NULLIF(rfm_monetary, 0)), 0)
    INTO v_avg_ltv_lifetime
  FROM public.customers_v3
  WHERE store_id = p_store_id;

  -- 12-month LTV: sum of orders_v3 valor per customer in last 365d / distinct customers
  BEGIN
    SELECT
      COALESCE(AVG(per_customer_total), 0)
    INTO v_avg_ltv_12m
    FROM (
      SELECT customer_id, SUM(COALESCE(valor, 0)) AS per_customer_total
      FROM public.orders_v3
      WHERE store_id = p_store_id
        AND created_at >= now() - interval '365 days'
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    ) t;
  EXCEPTION WHEN undefined_table THEN
    v_avg_ltv_12m := 0;
  END;

  -- Repeat Purchase Rate
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE order_count >= 1),
      COUNT(*) FILTER (WHERE order_count >= 2)
    INTO v_total_customers, v_repeat_customers
    FROM (
      SELECT customer_id, COUNT(*) AS order_count
      FROM public.orders_v3
      WHERE store_id = p_store_id
        AND customer_id IS NOT NULL
      GROUP BY customer_id
    ) c;
    IF v_total_customers > 0 THEN
      v_rpr := ROUND((v_repeat_customers::numeric / v_total_customers::numeric) * 100, 2);
    END IF;
  EXCEPTION WHEN undefined_table THEN
    v_rpr := 0;
  END;

  -- Average days between consecutive purchases (per customer, then averaged)
  BEGIN
    SELECT COALESCE(AVG(avg_gap_days), 0)
    INTO v_avg_days_between
    FROM (
      SELECT customer_id,
             AVG(EXTRACT(EPOCH FROM (created_at - prev_at)) / 86400.0) AS avg_gap_days
      FROM (
        SELECT customer_id,
               created_at,
               LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at) AS prev_at
        FROM public.orders_v3
        WHERE store_id = p_store_id AND customer_id IS NOT NULL
      ) g
      WHERE prev_at IS NOT NULL
      GROUP BY customer_id
    ) gaps;
  EXCEPTION WHEN undefined_table THEN
    v_avg_days_between := 0;
  END;

  -- Cohorts: pull last 12 monthly cohorts from customer_cohorts; D30 from table, D90/D180 derived from orders_v3
  BEGIN
    SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'cohort_month') DESC), '[]'::jsonb)
    INTO v_cohorts
    FROM (
      SELECT jsonb_build_object(
        'cohort_month', to_char(cc.cohort_month, 'YYYY-MM'),
        'cohort_size', cc.cohort_size,
        'retention_d30', COALESCE(cc.retention_d30, 0),
        'retention_d90', COALESCE((
          SELECT ROUND((COUNT(DISTINCT o.customer_id)::numeric / NULLIF(cc.cohort_size, 0)::numeric) * 100, 2)
          FROM public.orders_v3 o
          JOIN public.customers_v3 cu ON cu.id = o.customer_id
          WHERE cu.store_id = p_store_id
            AND date_trunc('month', cu.created_at)::date = cc.cohort_month
            AND o.created_at BETWEEN cu.created_at + interval '1 day' AND cu.created_at + interval '90 days'
        ), 0),
        'retention_d180', COALESCE((
          SELECT ROUND((COUNT(DISTINCT o.customer_id)::numeric / NULLIF(cc.cohort_size, 0)::numeric) * 100, 2)
          FROM public.orders_v3 o
          JOIN public.customers_v3 cu ON cu.id = o.customer_id
          WHERE cu.store_id = p_store_id
            AND date_trunc('month', cu.created_at)::date = cc.cohort_month
            AND o.created_at BETWEEN cu.created_at + interval '1 day' AND cu.created_at + interval '180 days'
        ), 0)
      ) AS c
      FROM public.customer_cohorts cc
      WHERE cc.store_id = p_store_id
      ORDER BY cc.cohort_month DESC
      LIMIT 12
    ) sub;
  EXCEPTION WHEN undefined_table THEN
    v_cohorts := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'avg_ltv_12m', ROUND(v_avg_ltv_12m, 2),
    'avg_ltv_lifetime', ROUND(v_avg_ltv_lifetime, 2),
    'repeat_purchase_rate', v_rpr,
    'avg_days_between_purchases', ROUND(v_avg_days_between, 1),
    'total_customers', v_total_customers,
    'repeat_customers', v_repeat_customers,
    'cohorts', v_cohorts,
    'computed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ltv_summary_v1(uuid) TO authenticated;