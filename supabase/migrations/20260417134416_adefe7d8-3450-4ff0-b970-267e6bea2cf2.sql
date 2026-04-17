-- ── Audit view: integrations sem store_id ou credencial ───────────────────
CREATE OR REPLACE VIEW public.v_integrations_audit AS
SELECT
  i.id,
  i.user_id,
  i.store_id,
  i.type,
  i.name,
  i.is_active,
  i.created_at,
  CASE
    WHEN i.store_id IS NULL THEN 'missing_store_id'
    WHEN i.is_active AND i.webhook_secret IS NULL AND i.webhook_token IS NULL
         AND coalesce(i.config->>'webhook_secret', i.config->>'access_token', i.config_json->>'webhook_secret', '') = ''
      THEN 'missing_webhook_credential'
    ELSE 'ok'
  END AS audit_status
FROM public.integrations i;

REVOKE ALL ON public.v_integrations_audit FROM PUBLIC;
GRANT SELECT ON public.v_integrations_audit TO authenticated;

-- RLS na view não é aplicável diretamente; protegemos via policy na query
-- usando uma função wrapper que verifica admin.
CREATE OR REPLACE FUNCTION public.list_integrations_audit()
RETURNS SETOF public.v_integrations_audit
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.v_integrations_audit
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- ── Audit view: channels sem store_id ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_channels_audit AS
SELECT
  c.id,
  c.user_id,
  c.store_id,
  c.tipo,
  c.plataforma,
  c.ativo,
  c.created_at,
  CASE
    WHEN c.store_id IS NULL THEN 'missing_store_id'
    WHEN c.ativo AND (c.credenciais_json IS NULL OR c.credenciais_json = '{}'::jsonb)
      THEN 'missing_credentials'
    ELSE 'ok'
  END AS audit_status
FROM public.channels c;

REVOKE ALL ON public.v_channels_audit FROM PUBLIC;
GRANT SELECT ON public.v_channels_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.list_channels_audit()
RETURNS SETOF public.v_channels_audit
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.v_channels_audit
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

-- ── Index para dashboards de erro recentes ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_client_error_events_created_at_desc
  ON public.client_error_events (created_at DESC);