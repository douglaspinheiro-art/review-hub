
-- ============================================================
-- Security hardening based on scan results
-- ============================================================

-- 1) shopify_oauth_claims: add explicit deny-all for authenticated/anon
--    (service_role only — claims are short-lived OAuth handoff tokens)
DROP POLICY IF EXISTS "shopify_oauth_claims_deny_all" ON public.shopify_oauth_claims;
CREATE POLICY "shopify_oauth_claims_deny_all"
  ON public.shopify_oauth_claims
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2) cron_config: add explicit deny-all for authenticated/anon
DROP POLICY IF EXISTS "cron_config_deny_all" ON public.cron_config;
CREATE POLICY "cron_config_deny_all"
  ON public.cron_config
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 3) sms_connections: scope policy role from public -> authenticated
DROP POLICY IF EXISTS "sms_connections_own" ON public.sms_connections;
CREATE POLICY "sms_connections_own"
  ON public.sms_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) system_config: stop exposing pipeline cursors to all signed-in users.
--    Replace the blanket read policy with: admins read everything; regular
--    authenticated users only read the public 'config_geral' maintenance row.
DROP POLICY IF EXISTS "system_config_read_auth" ON public.system_config;

CREATE POLICY "system_config_read_admin"
  ON public.system_config
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "system_config_read_auth_maintenance"
  ON public.system_config
  FOR SELECT
  TO authenticated
  USING (id = 'config_geral'::text);

-- 5) wa_usage_daily / wa_usage_events: add tenant read policies so users
--    can see their own usage/billing data
CREATE POLICY "wa_usage_daily_tenant_read"
  ON public.wa_usage_daily
  FOR SELECT
  TO authenticated
  USING (auth_row_read_user_store(user_id, store_id));

CREATE POLICY "wa_usage_events_tenant_read"
  ON public.wa_usage_events
  FOR SELECT
  TO authenticated
  USING (auth_row_read_user_store(user_id, store_id));

-- 6) abandoned_carts / contacts: restrict DELETE (and operator write of PII)
--    to the store owner only. Team members keep SELECT/INSERT/UPDATE via the
--    existing 'own'/'tenant' policies, but cannot DELETE customer PII rows.
CREATE POLICY "abandoned_carts_delete_owner_only"
  ON public.abandoned_carts
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "contacts_delete_owner_only"
  ON public.contacts
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
