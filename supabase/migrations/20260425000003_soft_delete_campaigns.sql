-- Update get_campaigns_bundle_v2 to exclude archived campaigns by default
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
          'sent', coalesce(sum(CASE WHEN ms.status = 'sent' OR ms.status = 'delivered' OR ms.status = 'read' OR ms.status = 'replied' THEN 1 ELSE 0 END), 0),
          'holdout', coalesce(sum(CASE WHEN ms.status = 'holdout' THEN 1 ELSE 0 END), 0),
          'suppressed_opt_out', coalesce(sum(CASE WHEN ms.status = 'suppressed_opt_out' THEN 1 ELSE 0 END), 0),
          'suppressed_cooldown', coalesce(sum(CASE WHEN ms.status = 'suppressed_cooldown' THEN 1 ELSE 0 END), 0)
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
      AND (
        (p_status = 'all' AND c.status != 'archived') 
        OR (p_status != 'all' AND c.status = p_status)
      )
      AND (p_channel = 'all' OR c.channel = p_channel)
      AND (p_created_since IS NULL OR c.created_at >= p_created_since)
    ORDER BY c.created_at DESC
    LIMIT p_limit
  ) tmp;

  RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;
