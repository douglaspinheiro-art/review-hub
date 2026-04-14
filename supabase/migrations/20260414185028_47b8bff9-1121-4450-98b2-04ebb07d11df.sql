
-- Fix 1: membros_loja — self-referential store_id comparison
DROP POLICY IF EXISTS "membros_read_own" ON public.membros_loja;
CREATE POLICY "membros_read_own"
  ON public.membros_loja
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.membros_loja ml2
      WHERE ml2.store_id = membros_loja.store_id
        AND ml2.user_id = auth.uid()
        AND ml2.permissao = 'dono'
    )
    OR user_id = auth.uid()
  );

-- Fix 2: ai_agent_config — s.user_id = s.user_id → s.user_id = auth.uid()
DROP POLICY IF EXISTS "ai_agent_config_select_tenant" ON public.ai_agent_config;
CREATE POLICY "ai_agent_config_select_tenant"
  ON public.ai_agent_config
  FOR SELECT
  TO authenticated
  USING (
    (store_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = ai_agent_config.store_id AND s.user_id = auth.uid())
    AND auth_row_read_user_store(user_id, store_id)
  );

DROP POLICY IF EXISTS "ai_agent_config_insert_tenant" ON public.ai_agent_config;
CREATE POLICY "ai_agent_config_insert_tenant"
  ON public.ai_agent_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (store_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = ai_agent_config.store_id AND s.user_id = auth.uid())
    AND auth_row_write_user_store(user_id, store_id)
  );

DROP POLICY IF EXISTS "ai_agent_config_update_tenant" ON public.ai_agent_config;
CREATE POLICY "ai_agent_config_update_tenant"
  ON public.ai_agent_config
  FOR UPDATE
  TO authenticated
  USING (
    (store_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = ai_agent_config.store_id AND s.user_id = auth.uid())
    AND auth_row_read_user_store(user_id, store_id)
  )
  WITH CHECK (
    (store_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = ai_agent_config.store_id AND s.user_id = auth.uid())
    AND auth_row_write_user_store(user_id, store_id)
  );

DROP POLICY IF EXISTS "ai_agent_config_delete_tenant" ON public.ai_agent_config;
CREATE POLICY "ai_agent_config_delete_tenant"
  ON public.ai_agent_config
  FOR DELETE
  TO authenticated
  USING (
    (store_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = ai_agent_config.store_id AND s.user_id = auth.uid())
    AND auth_row_write_user_store(user_id, store_id)
  );
