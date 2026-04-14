-- 20260424030000_automacoes_bundle_v2.sql
-- Consolidate journeys, counts and whatsapp status into a single RPC for Automacoes page

CREATE OR REPLACE FUNCTION public.get_automacoes_bundle_v2(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_journeys jsonb;
  v_counts jsonb;
  v_whatsapp_connected boolean;
BEGIN
  -- 1. Get journeys
  SELECT jsonb_agg(j)
  INTO v_journeys
  FROM (
    SELECT id, store_id, tipo_jornada, ativa, config_json, kpi_atual, updated_at
    FROM public.journeys_config
    WHERE store_id = p_store_id
    ORDER BY tipo_jornada
  ) j;

  -- 2. Get sent counts
  SELECT jsonb_object_agg(journey_id, sent_count)
  INTO v_counts
  FROM (
    SELECT sm.journey_id,
           COUNT(*)::bigint AS sent_count
    FROM public.scheduled_messages sm
    WHERE sm.store_id = p_store_id
      AND sm.status = 'sent'
      AND sm.journey_id IS NOT NULL
    GROUP BY sm.journey_id
  ) c;

  -- 3. Get WhatsApp status
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_connections
    WHERE store_id = p_store_id
      AND status = 'connected'
  ) INTO v_whatsapp_connected;

  RETURN jsonb_build_object(
    'journeys', coalesce(v_journeys, '[]'::jsonb),
    'counts', coalesce(v_counts, '{}'::jsonb),
    'whatsapp_connected', v_whatsapp_connected
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_automacoes_bundle_v2(uuid) TO authenticated;
