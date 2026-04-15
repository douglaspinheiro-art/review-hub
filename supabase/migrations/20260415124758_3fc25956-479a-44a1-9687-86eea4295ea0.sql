
-- ============================================================
-- 1. mp_webhook_events: block all writes from authenticated users
-- ============================================================
CREATE POLICY "mp_webhook_events_deny_insert"
  ON public.mp_webhook_events
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "mp_webhook_events_deny_update"
  ON public.mp_webhook_events
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "mp_webhook_events_deny_delete"
  ON public.mp_webhook_events
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 2. user_roles: prevent privilege escalation
--    Only service role can modify roles; users can only read own
-- ============================================================
CREATE POLICY "user_roles_deny_insert"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "user_roles_deny_update"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "user_roles_deny_delete"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 3. membros_loja: only store owner can manage members
-- ============================================================
CREATE POLICY "membros_loja_insert_owner"
  ON public.membros_loja
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = membros_loja.store_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "membros_loja_update_owner"
  ON public.membros_loja
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = membros_loja.store_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "membros_loja_delete_owner"
  ON public.membros_loja
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = membros_loja.store_id
        AND s.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. stripe_webhook_events: deny all authenticated access
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stripe_webhook_events') THEN
    EXECUTE 'CREATE POLICY "stripe_wh_deny_all" ON public.stripe_webhook_events FOR ALL TO authenticated USING (false) WITH CHECK (false)';
  END IF;
END $$;

-- ============================================================
-- 5. resend_webhook_events: deny all authenticated access
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resend_webhook_events') THEN
    EXECUTE 'CREATE POLICY "resend_wh_deny_all" ON public.resend_webhook_events FOR ALL TO authenticated USING (false) WITH CHECK (false)';
  END IF;
END $$;
