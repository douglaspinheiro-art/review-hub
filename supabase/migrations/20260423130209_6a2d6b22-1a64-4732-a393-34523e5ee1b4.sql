-- Loyalty KPIs
CREATE OR REPLACE FUNCTION public.get_loyalty_kpis_v1(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_active_members int := 0;
  v_points_circulating bigint := 0;
  v_points_redeemed bigint := 0;
  v_points_earned bigint := 0;
  v_redemption_rate numeric := 0;
  v_tier_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_caller <> p_user_id AND NOT public.auth_team_read_owner(p_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    COUNT(DISTINCT contact_id) FILTER (WHERE points > 0)
  INTO v_active_members
  FROM public.loyalty_balances
  WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(points), 0)
  INTO v_points_circulating
  FROM public.loyalty_balances
  WHERE user_id = p_user_id AND points > 0;

  SELECT
    COALESCE(SUM(CASE WHEN reason = 'redemption' THEN ABS(points) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0)
  INTO v_points_redeemed, v_points_earned
  FROM public.loyalty_transactions
  WHERE user_id = p_user_id;

  IF v_points_earned > 0 THEN
    v_redemption_rate := ROUND((v_points_redeemed::numeric / v_points_earned::numeric) * 100, 2);
  END IF;

  SELECT COALESCE(jsonb_object_agg(tier, cnt), '{}'::jsonb)
  INTO v_tier_counts
  FROM (
    SELECT COALESCE(LOWER(tier), 'bronze') AS tier, COUNT(*) AS cnt
    FROM public.loyalty_balances
    WHERE user_id = p_user_id AND points > 0
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'active_members', v_active_members,
    'points_circulating', v_points_circulating,
    'points_redeemed', v_points_redeemed,
    'points_earned', v_points_earned,
    'redemption_rate_pct', v_redemption_rate,
    'tier_counts', v_tier_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_loyalty_kpis_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loyalty_kpis_v1(uuid) TO authenticated;

-- Inbox SLA KPIs
CREATE OR REPLACE FUNCTION public.get_inbox_sla_kpis_v1(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_open int := 0;
  v_total_7d int := 0;
  v_within_sla int := 0;
  v_breach int := 0;
  v_pct_within_sla numeric := 0;
  v_avg_first_response_min numeric := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_caller <> p_user_id AND NOT public.auth_team_read_owner(p_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_open
  FROM public.conversations
  WHERE user_id = p_user_id AND status NOT IN ('closed', 'resolved');

  SELECT COUNT(*) INTO v_total_7d
  FROM public.conversations
  WHERE user_id = p_user_id AND created_at >= now() - interval '7 days';

  -- SLA dentro do prazo: sla_due_at no futuro OR conversa fechada antes do sla
  SELECT
    COUNT(*) FILTER (WHERE sla_due_at IS NULL OR sla_due_at > now() OR status IN ('closed','resolved')),
    COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL AND sla_due_at < now() AND status NOT IN ('closed','resolved'))
  INTO v_within_sla, v_breach
  FROM public.conversations
  WHERE user_id = p_user_id AND created_at >= now() - interval '7 days';

  IF v_total_7d > 0 THEN
    v_pct_within_sla := ROUND((v_within_sla::numeric / v_total_7d::numeric) * 100, 1);
  END IF;

  -- TMR: média de minutos entre 1ª mensagem inbound e 1ª resposta outbound (últimos 7d)
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (out_first - in_first)) / 60.0)::numeric, 1), 0)
  INTO v_avg_first_response_min
  FROM (
    SELECT
      conversation_id,
      MIN(created_at) FILTER (WHERE direction = 'inbound') AS in_first,
      MIN(created_at) FILTER (WHERE direction = 'outbound') AS out_first
    FROM public.messages
    WHERE user_id = p_user_id
      AND created_at >= now() - interval '7 days'
    GROUP BY conversation_id
  ) t
  WHERE in_first IS NOT NULL AND out_first IS NOT NULL AND out_first > in_first;

  RETURN jsonb_build_object(
    'open_conversations', v_open,
    'total_last_7d', v_total_7d,
    'within_sla_count', v_within_sla,
    'breach_count', v_breach,
    'pct_within_sla', v_pct_within_sla,
    'avg_first_response_min', v_avg_first_response_min
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_inbox_sla_kpis_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox_sla_kpis_v1(uuid) TO authenticated;