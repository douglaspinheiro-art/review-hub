
-- ─── Fase 1.3: ISL (Índice de Saúde da Loja) ───────────────────────────────
-- Combina 4 dimensões em um score 0-100 com período de warm-up.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS isl_score integer,
  ADD COLUMN IF NOT EXISTS isl_label text,
  ADD COLUMN IF NOT EXISTS isl_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS isl_updated_at timestamptz;

-- RPC principal: calcula ISL com warm-up e devolve breakdown.
CREATE OR REPLACE FUNCTION public.calculate_isl(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_age_days integer;
  v_customer_count integer;
  v_chs integer;
  v_engagement_score numeric := 0;
  v_rfm_health_score numeric := 0;
  v_revenue_trend_score numeric := 0;
  v_isl integer;
  v_label text;
  v_msg_sent integer := 0;
  v_msg_delivered integer := 0;
  v_msg_read integer := 0;
  v_healthy_segments integer := 0;
  v_total_with_segment integer := 0;
  v_rev_curr numeric := 0;
  v_rev_prev numeric := 0;
  v_breakdown jsonb;
BEGIN
  SELECT id, user_id, COALESCE(conversion_health_score, 0)::int AS chs, created_at
    INTO v_store
    FROM public.stores
   WHERE id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('insufficient_data', true, 'reason', 'store_not_found');
  END IF;

  v_age_days := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_store.created_at))::int / 86400);

  SELECT COUNT(*)::int INTO v_customer_count
    FROM public.customers_v3
   WHERE store_id = p_store_id;

  -- Warm-up: precisa de ≥ 30 dias e ≥ 50 clientes para evitar score distorcido.
  IF v_age_days < 30 OR v_customer_count < 50 THEN
    RETURN jsonb_build_object(
      'insufficient_data', true,
      'reason', CASE WHEN v_age_days < 30 THEN 'warm_up_period' ELSE 'low_customer_count' END,
      'days_remaining', GREATEST(0, 30 - v_age_days),
      'customers_needed', GREATEST(0, 50 - v_customer_count),
      'store_age_days', v_age_days,
      'customer_count', v_customer_count
    );
  END IF;

  v_chs := v_store.chs;

  -- Dimensão 2: Engajamento (delivery + read rate dos últimos 30 dias)
  SELECT
    COALESCE(SUM(messages_sent), 0)::int,
    COALESCE(SUM(messages_delivered), 0)::int,
    COALESCE(SUM(messages_read), 0)::int
   INTO v_msg_sent, v_msg_delivered, v_msg_read
   FROM public.analytics_daily
  WHERE store_id = p_store_id
    AND date >= (CURRENT_DATE - INTERVAL '30 days');

  IF v_msg_sent > 0 THEN
    v_engagement_score := LEAST(100,
      ((v_msg_delivered::numeric / v_msg_sent) * 60) +
      (CASE WHEN v_msg_delivered > 0 THEN (v_msg_read::numeric / v_msg_delivered) * 40 ELSE 0 END)
    );
  ELSE
    v_engagement_score := 50;
  END IF;

  -- Dimensão 3: Saúde RFM (% em segmentos saudáveis)
  SELECT
    COUNT(*) FILTER (WHERE LOWER(rfm_segment) IN ('campiao', 'champions', 'fiel', 'loyal', 'potencial_fiel', 'potential_loyal'))::int,
    COUNT(*) FILTER (WHERE rfm_segment IS NOT NULL)::int
    INTO v_healthy_segments, v_total_with_segment
    FROM public.customers_v3
   WHERE store_id = p_store_id;

  IF v_total_with_segment > 0 THEN
    v_rfm_health_score := (v_healthy_segments::numeric / v_total_with_segment) * 100;
  ELSE
    v_rfm_health_score := 50;
  END IF;

  -- Dimensão 4: Tendência de receita (mês atual vs. anterior)
  SELECT COALESCE(SUM(revenue_influenced), 0) INTO v_rev_curr
    FROM public.analytics_daily
   WHERE store_id = p_store_id AND date >= (CURRENT_DATE - INTERVAL '30 days');

  SELECT COALESCE(SUM(revenue_influenced), 0) INTO v_rev_prev
    FROM public.analytics_daily
   WHERE store_id = p_store_id
     AND date >= (CURRENT_DATE - INTERVAL '60 days')
     AND date <  (CURRENT_DATE - INTERVAL '30 days');

  IF v_rev_prev > 0 THEN
    v_revenue_trend_score := LEAST(100, GREATEST(0, 50 + ((v_rev_curr - v_rev_prev) / v_rev_prev) * 100));
  ELSIF v_rev_curr > 0 THEN
    v_revenue_trend_score := 75;
  ELSE
    v_revenue_trend_score := 40;
  END IF;

  -- Combinação ponderada
  v_isl := ROUND(
    (v_chs * 0.40) +
    (v_engagement_score * 0.25) +
    (v_rfm_health_score * 0.20) +
    (v_revenue_trend_score * 0.15)
  )::int;

  v_isl := GREATEST(0, LEAST(100, v_isl));

  v_label := CASE
    WHEN v_isl < 30 THEN 'Crítico'
    WHEN v_isl < 50 THEN 'Em risco'
    WHEN v_isl < 70 THEN 'Regular'
    WHEN v_isl < 85 THEN 'Bom'
    ELSE 'Excelente'
  END;

  v_breakdown := jsonb_build_object(
    'chs', v_chs,
    'engagement', ROUND(v_engagement_score)::int,
    'rfm_health', ROUND(v_rfm_health_score)::int,
    'revenue_trend', ROUND(v_revenue_trend_score)::int
  );

  -- Persistir score + histórico (mantém últimos 90 pontos)
  UPDATE public.stores
     SET isl_score = v_isl,
         isl_label = v_label,
         isl_updated_at = now(),
         isl_history = (
           COALESCE(isl_history, '[]'::jsonb) ||
           jsonb_build_array(jsonb_build_object(
             'date', to_char(now(), 'YYYY-MM-DD'),
             'score', v_isl,
             'label', v_label
           ))
         )
   WHERE id = p_store_id;

  -- Truncar histórico para últimos 90 pontos (1 por dia ≈ 3 meses)
  UPDATE public.stores
     SET isl_history = (
       SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
       FROM (
         SELECT elem
         FROM jsonb_array_elements(isl_history) AS t(elem)
         ORDER BY (elem->>'date') DESC
         LIMIT 90
       ) sub
     )
   WHERE id = p_store_id
     AND jsonb_array_length(COALESCE(isl_history, '[]'::jsonb)) > 90;

  RETURN jsonb_build_object(
    'insufficient_data', false,
    'isl_score', v_isl,
    'isl_label', v_label,
    'breakdown', v_breakdown,
    'store_age_days', v_age_days,
    'customer_count', v_customer_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_isl(uuid) TO authenticated;
