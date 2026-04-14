
DROP FUNCTION IF EXISTS public.get_dashboard_snapshot(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(
  p_store_id uuid,
  p_period_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_since timestamptz := now() - (p_period_days || ' days')::interval;
  v_prev_since timestamptz := now() - (p_period_days * 2 || ' days')::interval;
BEGIN
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
$$;
