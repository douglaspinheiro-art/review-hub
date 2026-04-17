GRANT EXECUTE ON FUNCTION public.get_execution_monitor_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_roi_attribution_bundle_v2(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_agent_bundle_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abandoned_carts_v2(uuid, timestamp without time zone, text, timestamp without time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_bundle_v2(uuid) TO authenticated;