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
        WHERE store_id = p_store_id
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
NOTIFY pgrst, 'reload schema';