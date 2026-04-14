-- 20260501120000_fix_abandoned_carts_v2_select.sql
--
-- Fixes get_abandoned_carts_v2: replaces SELECT * with explicit column list,
-- excluding raw_payload and inventory_status (large JSONB blobs).
-- At 100 stores, SELECT * was returning up to 10MB+ per page call.

CREATE OR REPLACE FUNCTION public.get_abandoned_carts_v2(
  p_store_id UUID,
  p_since TIMESTAMP,
  p_status TEXT DEFAULT 'all',
  p_cursor_created_at TIMESTAMP DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpi JSONB;
  v_rows JSONB;
  v_total_count INT;
  v_store_owner UUID;
BEGIN
  -- Validate that the caller owns this store (prevent tenant data leakage).
  -- SECURITY DEFINER bypasses RLS, so we enforce ownership explicitly.
  SELECT user_id INTO v_store_owner
  FROM public.stores
  WHERE id = p_store_id;

  IF v_store_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: store does not belong to the current user';
  END IF;

  -- KPIs agregados
  SELECT jsonb_build_object(
    'total', count(*),
    'recovered', count(*) FILTER (WHERE status = 'recovered'),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'total_value', coalesce(sum(cart_value), 0),
    'recovered_value', coalesce(sum(cart_value) FILTER (WHERE status = 'recovered'), 0)
  ) INTO v_kpi
  FROM abandoned_carts
  WHERE store_id = p_store_id AND created_at >= p_since;

  -- Contagem total filtrada (para paginação)
  SELECT count(*) INTO v_total_count
  FROM abandoned_carts
  WHERE store_id = p_store_id
    AND created_at >= p_since
    AND (p_status = 'all' OR status = p_status);

  -- Linhas da página com colunas explícitas (sem raw_payload / inventory_status)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                    tmp.id,
      'store_id',              tmp.store_id,
      'customer_id',           tmp.customer_id,
      'external_id',           tmp.external_id,
      'source',                tmp.source,
      'cart_value',            tmp.cart_value,
      'cart_items',            tmp.cart_items,
      'status',                tmp.status,
      'created_at',            tmp.created_at,
      'updated_at',            tmp.updated_at,
      'recovery_url',          tmp.recovery_url,
      'utm_source',            tmp.utm_source,
      'utm_medium',            tmp.utm_medium,
      'utm_campaign',          tmp.utm_campaign,
      'payment_failure_reason', tmp.payment_failure_reason,
      'abandon_step',          tmp.abandon_step,
      'message_sent_at',       tmp.message_sent_at,
      'shipping_value',        tmp.shipping_value,
      'shipping_zip_code',     tmp.shipping_zip_code
    )
  ) INTO v_rows
  FROM (
    SELECT
      id, store_id, customer_id, external_id, source,
      cart_value, cart_items, status, created_at, updated_at,
      recovery_url, utm_source, utm_medium, utm_campaign,
      payment_failure_reason, abandon_step, message_sent_at,
      shipping_value, shipping_zip_code
    FROM abandoned_carts
    WHERE store_id = p_store_id
      AND created_at >= p_since
      AND (p_status = 'all' OR status = p_status)
      AND (p_cursor_created_at IS NULL OR created_at < p_cursor_created_at)
    ORDER BY created_at DESC
    LIMIT p_limit
  ) tmp;

  RETURN jsonb_build_object(
    'kpi', v_kpi,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total_count', v_total_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_carts_v2(UUID, TIMESTAMP, TEXT, TIMESTAMP, INT) TO authenticated;
