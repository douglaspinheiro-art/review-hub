-- =============================================
-- SECURITY HARDENING: Views → SECURITY INVOKER
-- =============================================

ALTER VIEW public.canais SET (security_invoker = on);
ALTER VIEW public.clientes SET (security_invoker = on);
ALTER VIEW public.comunicacoes_enviadas SET (security_invoker = on);
ALTER VIEW public.execucoes SET (security_invoker = on);
ALTER VIEW public.lojas SET (security_invoker = on);
ALTER VIEW public.pedidos_v3_legacy SET (security_invoker = on);
ALTER VIEW public.prescricoes SET (security_invoker = on);
ALTER VIEW public.problemas SET (security_invoker = on);
ALTER VIEW public.produtos SET (security_invoker = on);
ALTER VIEW public.sistema_config_legacy SET (security_invoker = on);
ALTER VIEW public.v_order_line_items SET (security_invoker = on);
ALTER VIEW public.v_orders_net_revenue SET (security_invoker = on);

-- =============================================
-- SECURITY HARDENING: Functions → search_path = public
-- =============================================

ALTER FUNCTION public.add_loyalty_points SET search_path = public;
ALTER FUNCTION public.append_chs_history SET search_path = public;
ALTER FUNCTION public.audit_store_changes SET search_path = public;
ALTER FUNCTION public.calcular_segmento_rfm SET search_path = public;
ALTER FUNCTION public.calculate_rfm_for_store SET search_path = public;
ALTER FUNCTION public.calculate_store_percentil SET search_path = public;
ALTER FUNCTION public.calculate_tier SET search_path = public;
ALTER FUNCTION public.check_rate_limit SET search_path = public;
ALTER FUNCTION public.get_optimal_send_hour SET search_path = public;
ALTER FUNCTION public.increment_campaign_sent_count SET search_path = public;
ALTER FUNCTION public.increment_daily_analytics_messages SET search_path = public;
ALTER FUNCTION public.increment_unread_count SET search_path = public;
ALTER FUNCTION public.notify_critical_stock SET search_path = public;
ALTER FUNCTION public.processar_novo_pedido_v3 SET search_path = public;
ALTER FUNCTION public.resolve_loyalty_by_phone SET search_path = public;
ALTER FUNCTION public.set_updated_at SET search_path = public;
ALTER FUNCTION public.sync_contacts_to_customers_v3 SET search_path = public;
ALTER FUNCTION public.sync_order_to_analytics SET search_path = public;
ALTER FUNCTION public.update_contact_metrics SET search_path = public;
ALTER FUNCTION public.update_loja_chs SET search_path = public;
ALTER FUNCTION public.write_audit_log SET search_path = public;