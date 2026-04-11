-- Agregações no servidor para dashboard (fidelidade, canais, carrinho, automações).
-- SECURITY DEFINER com auth.uid() — executar como migração no projeto Supabase.

-- ── Loyalty: KPIs sem carregar loyalty_points inteiro ───────────────────────
CREATE OR REPLACE FUNCTION public.get_loyalty_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'members_with_balance',
        (SELECT COUNT(*)::bigint FROM public.loyalty_points lp WHERE lp.user_id = uid AND COALESCE(lp.points, 0) > 0),
      'total_points_balance',
        (SELECT COALESCE(SUM(lp.points), 0)::bigint FROM public.loyalty_points lp WHERE lp.user_id = uid),
      'total_earned_sum',
        (SELECT COALESCE(SUM(lp.total_earned), 0)::bigint FROM public.loyalty_points lp WHERE lp.user_id = uid),
      'total_redeemed_sum',
        (SELECT COALESCE(SUM(lp.total_redeemed), 0)::bigint FROM public.loyalty_points lp WHERE lp.user_id = uid),
      'tier_counts',
        COALESCE(
          (
            SELECT jsonb_object_agg(s.tk, s.cnt)
            FROM (
              SELECT lower(COALESCE(lp.tier, 'bronze')) AS tk, COUNT(*)::bigint AS cnt
              FROM public.loyalty_points lp
              WHERE lp.user_id = uid
              GROUP BY 1
            ) s
          ),
          '{}'::jsonb
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_loyalty_dashboard_summary() FROM public;
GRANT EXECUTE ON FUNCTION public.get_loyalty_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_loyalty_dashboard_summary() TO service_role;

-- ── Canais: pedidos / receita por canal (janela temporal) ────────────────────
CREATE OR REPLACE FUNCTION public.get_channel_order_stats(p_store_id uuid, p_since timestamptz)
RETURNS TABLE (canal_id uuid, pedidos bigint, receita numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.canal_id,
         COUNT(*)::bigint AS pedidos,
         COALESCE(SUM(o.valor), 0)::numeric AS receita
  FROM public.orders_v3 o
  INNER JOIN public.stores s ON s.id = o.store_id AND s.user_id = auth.uid()
  WHERE o.store_id = p_store_id
    AND o.created_at >= p_since
    AND o.canal_id IS NOT NULL
  GROUP BY o.canal_id;
$$;

REVOKE ALL ON FUNCTION public.get_channel_order_stats(uuid, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.get_channel_order_stats(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_order_stats(uuid, timestamptz) TO service_role;

-- ── Carrinho abandonado: KPIs no período (todas as situações) ───────────────
CREATE OR REPLACE FUNCTION public.get_abandoned_cart_kpis(p_store_id uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.user_id = uid) THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'total', COUNT(*)::bigint,
    'recovered', COUNT(*) FILTER (WHERE ac.status = 'recovered')::bigint,
    'pending', COUNT(*) FILTER (WHERE ac.status = 'pending')::bigint,
    'total_value', COALESCE(SUM(ac.cart_value), 0)::numeric,
    'recovered_value', COALESCE(SUM(ac.cart_value) FILTER (WHERE ac.status = 'recovered'), 0)::numeric
  )
  INTO j
  FROM public.abandoned_carts ac
  WHERE ac.store_id = p_store_id
    AND ac.created_at >= p_since;
  RETURN COALESCE(j, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_abandoned_cart_kpis(uuid, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_kpis(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_kpis(uuid, timestamptz) TO service_role;

-- ── Automações: enviados por jornada (status sent) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_journey_sent_counts(p_store_id uuid, p_journey_ids uuid[])
RETURNS TABLE (journey_id uuid, sent_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.journey_id,
         COUNT(*)::bigint AS sent_count
  FROM public.scheduled_messages sm
  INNER JOIN public.stores s ON s.id = sm.store_id AND s.user_id = auth.uid()
  WHERE sm.store_id = p_store_id
    AND sm.journey_id = ANY (p_journey_ids)
    AND sm.status = 'sent'
  GROUP BY sm.journey_id;
$$;

REVOKE ALL ON FUNCTION public.get_journey_sent_counts(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_journey_sent_counts(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_journey_sent_counts(uuid, uuid[]) TO service_role;

-- Índice auxiliar: metadata->>'cart_id' em pendentes (lookup carrinho)
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_store_pending_cart_id
  ON public.scheduled_messages (store_id, (metadata ->> 'cart_id'))
  WHERE status = 'pending' AND (metadata ->> 'cart_id') IS NOT NULL;
