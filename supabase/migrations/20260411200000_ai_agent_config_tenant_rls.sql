-- ai_agent_config: RLS alinhado ao tenant (dono + equipa), com user_id = dono da loja.

ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_agent_config_own" ON public.ai_agent_config;
DROP POLICY IF EXISTS ai_agent_config_own ON public.ai_agent_config;
DROP POLICY IF EXISTS ai_agent_config_select_tenant ON public.ai_agent_config;
DROP POLICY IF EXISTS ai_agent_config_insert_tenant ON public.ai_agent_config;
DROP POLICY IF EXISTS ai_agent_config_update_tenant ON public.ai_agent_config;
DROP POLICY IF EXISTS ai_agent_config_delete_tenant ON public.ai_agent_config;

-- user_id deve ser o dono da loja (stores.user_id) para leituras consistentes entre dono e colaboradores.
CREATE POLICY ai_agent_config_select_tenant ON public.ai_agent_config
  FOR SELECT TO authenticated
  USING (
    store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = user_id)
    AND public.auth_row_read_user_store(user_id, store_id)
  );

CREATE POLICY ai_agent_config_insert_tenant ON public.ai_agent_config
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = user_id)
    AND public.auth_row_write_user_store(user_id, store_id)
  );

CREATE POLICY ai_agent_config_update_tenant ON public.ai_agent_config
  FOR UPDATE TO authenticated
  USING (
    store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = user_id)
    AND public.auth_row_read_user_store(user_id, store_id)
  )
  WITH CHECK (
    store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = user_id)
    AND public.auth_row_write_user_store(user_id, store_id)
  );

CREATE POLICY ai_agent_config_delete_tenant ON public.ai_agent_config
  FOR DELETE TO authenticated
  USING (
    store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = user_id)
    AND public.auth_row_write_user_store(user_id, store_id)
  );
