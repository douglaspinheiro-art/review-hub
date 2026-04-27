-- ============================================================================
-- Admin Store Impersonation: tabela de sessões + RPCs auditadas + bypass RLS
-- ============================================================================

-- 1a. Tabela de sessões ativas de impersonação (uma por admin)
CREATE TABLE IF NOT EXISTS public.admin_active_sessions (
  admin_user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL,
  target_store_id uuid NOT NULL,
  write_enabled   boolean NOT NULL DEFAULT false,
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.admin_active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_sessions_self ON public.admin_active_sessions;
CREATE POLICY admin_sessions_self ON public.admin_active_sessions
  FOR SELECT TO authenticated
  USING (admin_user_id = auth.uid());
-- Sem políticas de INSERT/UPDATE/DELETE: tudo via RPCs SECURITY DEFINER abaixo.

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON public.admin_active_sessions(expires_at);

-- 1b. Função que checa se o admin atual pode acessar dados de um user-alvo
CREATE OR REPLACE FUNCTION public.admin_can_access_user(p_target_user_id uuid, p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role((SELECT auth.uid()), 'admin'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.admin_active_sessions s
      WHERE s.admin_user_id = (SELECT auth.uid())
        AND s.target_user_id = p_target_user_id
        AND s.expires_at > now()
        AND (NOT p_write OR s.write_enabled)
    );
$$;

GRANT EXECUTE ON FUNCTION public.admin_can_access_user(uuid, boolean) TO authenticated;

-- 1c. Atualizar helpers RLS (cobrem dezenas de tabelas tenant)
CREATE OR REPLACE FUNCTION public.auth_row_read_user_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id = (SELECT auth.uid())
    OR (p_store_id IS NOT NULL AND public.auth_team_read_store(p_store_id))
    OR (p_store_id IS NULL AND public.auth_team_read_owner(p_user_id))
    OR public.admin_can_access_user(p_user_id, false);
$$;

CREATE OR REPLACE FUNCTION public.auth_row_write_user_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id = (SELECT auth.uid())
    OR (p_store_id IS NOT NULL AND public.auth_team_write_store(p_store_id))
    OR (p_store_id IS NULL AND public.auth_team_write_owner(p_user_id))
    OR public.admin_can_access_user(p_user_id, true);
$$;

-- 1d. Policy de stores: admin lê stores apenas durante impersonação ativa
DROP POLICY IF EXISTS stores_select_tenant ON public.stores;
CREATE POLICY stores_select_tenant ON public.stores
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_team_read_store(id)
    OR public.admin_can_access_user(user_id, false)
  );

-- 1e. RPC: listar todas as lojas (uso exclusivo do painel admin)
CREATE OR REPLACE FUNCTION public.admin_list_stores(p_search text DEFAULT NULL)
RETURNS TABLE(
  store_id uuid,
  store_name text,
  store_user_id uuid,
  user_email text,
  user_full_name text,
  plan text,
  subscription_status text,
  onboarding_completed boolean,
  store_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.user_id,
    u.email::text,
    p.full_name,
    p.plan,
    p.subscription_status,
    p.onboarding_completed,
    s.created_at
  FROM public.stores s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE p_search IS NULL
     OR s.name ILIKE '%' || p_search || '%'
     OR u.email ILIKE '%' || p_search || '%'
  ORDER BY s.created_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_stores(text) TO authenticated;

-- 1f. RPC: iniciar sessão de impersonação (read-only) + auditoria
CREATE OR REPLACE FUNCTION public.admin_enter_store(p_store_id uuid)
RETURNS TABLE(
  target_user_id uuid,
  target_store_name text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_name  text;
  v_exp   timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT s.user_id, s.name INTO v_owner, v_name
  FROM public.stores s
  WHERE s.id = p_store_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'store_not_found';
  END IF;

  v_exp := now() + interval '1 hour';

  INSERT INTO public.admin_active_sessions(admin_user_id, target_user_id, target_store_id, expires_at, write_enabled)
  VALUES (auth.uid(), v_owner, p_store_id, v_exp, false)
  ON CONFLICT (admin_user_id) DO UPDATE
    SET target_user_id  = EXCLUDED.target_user_id,
        target_store_id = EXCLUDED.target_store_id,
        expires_at      = EXCLUDED.expires_at,
        write_enabled   = false,
        started_at      = now();

  INSERT INTO public.audit_logs(user_id, action, resource, result, store_id, metadata)
  VALUES (
    auth.uid(),
    'admin_impersonate_start',
    'store',
    'success',
    p_store_id,
    jsonb_build_object('target_user_id', v_owner, 'expires_at', v_exp)
  );

  RETURN QUERY SELECT v_owner, v_name, v_exp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_enter_store(uuid) TO authenticated;

-- 1g. RPC: encerrar sessão de impersonação + auditoria
CREATE OR REPLACE FUNCTION public.admin_exit_store()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_target_store uuid;
BEGIN
  SELECT target_user_id, target_store_id INTO v_target_user, v_target_store
  FROM public.admin_active_sessions
  WHERE admin_user_id = auth.uid();

  DELETE FROM public.admin_active_sessions WHERE admin_user_id = auth.uid();

  IF v_target_user IS NOT NULL THEN
    INSERT INTO public.audit_logs(user_id, action, resource, result, store_id, metadata)
    VALUES (
      auth.uid(),
      'admin_impersonate_end',
      'store',
      'success',
      v_target_store,
      jsonb_build_object('target_user_id', v_target_user)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_exit_store() TO authenticated;

-- 1h. RPC: alternar modo edição + auditoria
CREATE OR REPLACE FUNCTION public.admin_set_write_mode(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_target_store uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  UPDATE public.admin_active_sessions
  SET write_enabled = p_enabled
  WHERE admin_user_id = auth.uid()
    AND expires_at > now()
  RETURNING target_user_id, target_store_id INTO v_target_user, v_target_store;

  IF v_target_user IS NULL THEN
    RAISE EXCEPTION 'no_active_session';
  END IF;

  INSERT INTO public.audit_logs(user_id, action, resource, result, store_id, metadata)
  VALUES (
    auth.uid(),
    'admin_write_mode_toggle',
    'store',
    'success',
    v_target_store,
    jsonb_build_object('target_user_id', v_target_user, 'write_enabled', p_enabled)
  );

  RETURN p_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_write_mode(boolean) TO authenticated;