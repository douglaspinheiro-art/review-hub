
-- ============================================================
-- Bloco 1: RLS Policies TO public → TO authenticated
-- ============================================================

-- affiliate_referrals
DROP POLICY IF EXISTS "affiliates_own" ON affiliate_referrals;
CREATE POLICY "affiliates_own" ON affiliate_referrals FOR ALL TO authenticated
  USING (auth.uid() = referrer_id);

-- ai_agent_config (legacy policy)
DROP POLICY IF EXISTS "agente_ia_own" ON ai_agent_config;
CREATE POLICY "agente_ia_own" ON ai_agent_config FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- ai_generated_coupons
DROP POLICY IF EXISTS "ai_coupons_own" ON ai_generated_coupons;
CREATE POLICY "ai_coupons_own" ON ai_generated_coupons FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- api_keys
DROP POLICY IF EXISTS "api_keys_own" ON api_keys;
CREATE POLICY "api_keys_own" ON api_keys FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- benchmark_reports
DROP POLICY IF EXISTS "benchmark_reports_own" ON benchmark_reports;
CREATE POLICY "benchmark_reports_own" ON benchmark_reports FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- channels
DROP POLICY IF EXISTS "canais_own" ON channels;
CREATE POLICY "canais_own" ON channels FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- communications_sent
DROP POLICY IF EXISTS "comunicacoes_enviadas_own" ON communications_sent;
CREATE POLICY "comunicacoes_enviadas_own" ON communications_sent FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- convertiq_settings
DROP POLICY IF EXISTS "users own configuracoes_convertiq" ON convertiq_settings;
CREATE POLICY "users own configuracoes_convertiq" ON convertiq_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- diagnostics (legacy policy only; diagnostics_tenant stays)
DROP POLICY IF EXISTS "users own diagnosticos" ON diagnostics;
CREATE POLICY "users own diagnosticos" ON diagnostics FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- executions
DROP POLICY IF EXISTS "execucoes_own" ON executions;
CREATE POLICY "execucoes_own" ON executions FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- funnel_metrics
DROP POLICY IF EXISTS "users own metricas_funil" ON funnel_metrics;
CREATE POLICY "users own metricas_funil" ON funnel_metrics FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- funnel_metrics_v3
DROP POLICY IF EXISTS "metricas_v3_own" ON funnel_metrics_v3;
CREATE POLICY "metricas_v3_own" ON funnel_metrics_v3 FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- loyalty_points
DROP POLICY IF EXISTS "loyalty_points_owner" ON loyalty_points;
CREATE POLICY "loyalty_points_owner" ON loyalty_points FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- audit_logs (2 legacy public policies)
DROP POLICY IF EXISTS "Owners can view own audit logs" ON audit_logs;
CREATE POLICY "Owners can view own audit logs" ON audit_logs FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT stores.user_id FROM stores WHERE stores.id = audit_logs.store_id));

DROP POLICY IF EXISTS "audit_logs_collaborator_read" ON audit_logs;
CREATE POLICY "audit_logs_collaborator_read" ON audit_logs FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR auth_team_read_store(store_id));

-- integration_interest (3 policies)
DROP POLICY IF EXISTS "integration_interest_insert_own" ON integration_interest;
CREATE POLICY "integration_interest_insert_own" ON integration_interest FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "integration_interest_select_own" ON integration_interest;
CREATE POLICY "integration_interest_select_own" ON integration_interest FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "integration_interest_update_own" ON integration_interest;
CREATE POLICY "integration_interest_update_own" ON integration_interest FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- journeys_config
DROP POLICY IF EXISTS "journeys_config_own" ON journeys_config;
CREATE POLICY "journeys_config_own" ON journeys_config FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()));

-- loyalty_config
DROP POLICY IF EXISTS "loyalty_config_own" ON loyalty_config;
CREATE POLICY "loyalty_config_own" ON loyalty_config FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()));

-- loyalty_points_v3
DROP POLICY IF EXISTS "loyalty_points_v3_own" ON loyalty_points_v3;
CREATE POLICY "loyalty_points_v3_own" ON loyalty_points_v3 FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()));

-- loyalty_rewards
DROP POLICY IF EXISTS "loyalty_rewards_own" ON loyalty_rewards;
CREATE POLICY "loyalty_rewards_own" ON loyalty_rewards FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()));

-- diagnostics_v3 (legacy public policy)
DROP POLICY IF EXISTS "Users can view own diagnostics" ON diagnostics_v3;
CREATE POLICY "Users can view own diagnostics" ON diagnostics_v3 FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = diagnostics_v3.store_id AND stores.user_id = auth.uid()));

-- ============================================================
-- Bloco 3: Views SECURITY DEFINER → SECURITY INVOKER
-- ============================================================

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
