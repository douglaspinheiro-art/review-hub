
-- 1) get_execution_monitor_bundle_v2: detected_at -> created_at
CREATE OR REPLACE FUNCTION public.get_execution_monitor_bundle_v2(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prescriptions JSONB;
  v_campaigns JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(p) INTO v_prescriptions
  FROM (
    SELECT id, title, status, execution_channel, created_at AS detected_at, estimated_potential, estimated_roi
    FROM public.prescriptions
    WHERE store_id = p_store_id AND status IN ('em_execucao', 'pausada')
    ORDER BY created_at DESC
  ) p;

  SELECT jsonb_agg(c) INTO v_campaigns
  FROM (
    SELECT 
      cam.id, cam.name, cam.status, cam.channel, cam.source_prescription_id,
      cam.sent_count, cam.delivered_count, cam.read_count, cam.reply_count, cam.total_contacts,
      NULL::uuid AS ab_test_id,
      NULL::text AS winner_variant
    FROM public.campaigns cam
    WHERE cam.store_id = p_store_id 
      AND cam.source_prescription_id IN (
        SELECT id FROM public.prescriptions WHERE store_id = p_store_id AND status IN ('em_execucao', 'pausada')
      )
  ) c;

  RETURN jsonb_build_object(
    'prescriptions', coalesce(v_prescriptions, '[]'::jsonb),
    'campaigns', coalesce(v_campaigns, '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_execution_monitor_bundle_v2(uuid) TO authenticated;

-- 2) get_abandoned_carts_v2: remove colunas inexistentes
CREATE OR REPLACE FUNCTION public.get_abandoned_carts_v2(
  p_store_id uuid,
  p_since timestamp without time zone,
  p_status text DEFAULT 'all'::text,
  p_cursor_created_at timestamp without time zone DEFAULT NULL::timestamp without time zone,
  p_limit integer DEFAULT 20
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kpi JSONB;
  v_rows JSONB;
  v_total_count INT;
  v_store_owner UUID;
BEGIN
  SELECT user_id INTO v_store_owner
  FROM public.stores
  WHERE id = p_store_id;

  IF v_store_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: store does not belong to the current user';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'recovered', count(*) FILTER (WHERE status = 'recovered'),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'total_value', coalesce(sum(cart_value), 0),
    'recovered_value', coalesce(sum(cart_value) FILTER (WHERE status = 'recovered'), 0)
  ) INTO v_kpi
  FROM abandoned_carts
  WHERE store_id = p_store_id AND created_at >= p_since;

  SELECT count(*) INTO v_total_count
  FROM abandoned_carts
  WHERE store_id = p_store_id
    AND created_at >= p_since
    AND (p_status = 'all' OR status = p_status);

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
      'abandon_step',          tmp.abandon_step,
      'message_sent_at',       tmp.message_sent_at
    )
  ) INTO v_rows
  FROM (
    SELECT
      id, store_id, customer_id, external_id, source,
      cart_value, cart_items, status, created_at, updated_at,
      recovery_url, utm_source, utm_medium, utm_campaign,
      abandon_step, message_sent_at
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_carts_v2(uuid, timestamp without time zone, text, timestamp without time zone, integer) TO authenticated;

-- 3) get_whatsapp_bundle_v2: phone_number -> instance_name; remove connected_at
CREATE OR REPLACE FUNCTION public.get_whatsapp_bundle_v2(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_connections JSONB;
  v_health_summary JSONB;
BEGIN
  PERFORM public.assert_store_access(p_store_id);

  SELECT jsonb_agg(c) INTO v_connections
  FROM (
    SELECT id, instance_name, instance_name AS phone_number, status, provider,
           meta_phone_number_id, meta_waba_id, meta_default_template_name,
           updated_at AS connected_at, created_at, store_id
    FROM public.whatsapp_connections
    WHERE store_id = p_store_id
    ORDER BY created_at DESC
  ) c;

  SELECT jsonb_build_object(
    'recent_errors', (
      SELECT jsonb_agg(l) FROM (
        SELECT id, created_at, event_type, status, error_message
        FROM public.webhook_logs
        WHERE (metadata->>'store_id')::uuid = p_store_id
          AND status = 'error'
          AND event_type ILIKE '%whatsapp%'
        ORDER BY created_at DESC
        LIMIT 10
      ) l
    ),
    'total_connected', count(*) FILTER (WHERE status = 'connected')
  ) INTO v_health_summary
  FROM public.whatsapp_connections
  WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'connections', coalesce(v_connections, '[]'::jsonb),
    'health', v_health_summary
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_bundle_v2(uuid) TO authenticated;
