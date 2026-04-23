-- Heatmap de envios + atribuições por dia da semana e hora (TZ Brasil/SP)
CREATE OR REPLACE FUNCTION public.get_conversion_heatmap_v1(
  p_store_id uuid,
  p_days integer DEFAULT 90
)
RETURNS TABLE (
  dow integer,        -- 0 = domingo … 6 = sábado (timezone America/Sao_Paulo)
  hour integer,       -- 0..23
  sends_count bigint,
  attributed_count bigint,
  attributed_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_bounds AS (
    SELECT (now() - (GREATEST(1, p_days) || ' days')::interval) AS since
  ),
  authorized AS (
    SELECT s.id, s.user_id
    FROM public.stores s, window_bounds
    WHERE s.id = p_store_id
      AND (
        s.user_id = auth.uid()
        OR public.auth_team_read_store(s.id)
      )
  ),
  sends AS (
    SELECT
      EXTRACT(DOW  FROM (ms.sent_at AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
      EXTRACT(HOUR FROM (ms.sent_at AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
      COUNT(*)::bigint AS sends_count
    FROM public.message_sends ms, window_bounds, authorized a
    WHERE ms.store_id = a.id
      AND ms.sent_at >= window_bounds.since
    GROUP BY 1, 2
  ),
  attribs AS (
    SELECT
      EXTRACT(DOW  FROM (ae.order_date AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
      EXTRACT(HOUR FROM (ae.order_date AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
      COUNT(*)::bigint AS attributed_count,
      COALESCE(SUM(ae.order_value), 0)::numeric AS attributed_revenue
    FROM public.attribution_events ae, window_bounds, authorized a
    WHERE ae.user_id = a.user_id
      AND ae.order_date >= window_bounds.since
    GROUP BY 1, 2
  )
  SELECT
    COALESCE(s.dow, a.dow)   AS dow,
    COALESCE(s.hour, a.hour) AS hour,
    COALESCE(s.sends_count, 0)        AS sends_count,
    COALESCE(a.attributed_count, 0)   AS attributed_count,
    COALESCE(a.attributed_revenue, 0) AS attributed_revenue
  FROM sends s
  FULL OUTER JOIN attribs a
    ON a.dow = s.dow AND a.hour = s.hour
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversion_heatmap_v1(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_conversion_heatmap_v1(uuid, integer) IS
'Retorna agregação de envios (message_sends) e pedidos atribuídos (attribution_events) por dia da semana e hora, na timezone America/Sao_Paulo. Janela padrão 90 dias.';

-- Cohorts de retenção mensal já calculados pelo data-pipeline-cron
CREATE OR REPLACE FUNCTION public.get_retention_cohorts_v1(
  p_store_id uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  cohort_month date,
  cohort_size integer,
  retention_d30 numeric,
  computed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.cohort_month, cc.cohort_size, cc.retention_d30, cc.computed_at
  FROM public.customer_cohorts cc
  WHERE cc.store_id = p_store_id
    AND (
      cc.user_id = auth.uid()
      OR public.auth_team_read_store(cc.store_id)
    )
  ORDER BY cc.cohort_month DESC
  LIMIT GREATEST(1, p_limit);
$$;

GRANT EXECUTE ON FUNCTION public.get_retention_cohorts_v1(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_retention_cohorts_v1(uuid, integer) IS
'Lista os snapshots mais recentes de customer_cohorts para a loja, ordenados do mês mais recente para o mais antigo.';