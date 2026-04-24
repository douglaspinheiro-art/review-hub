-- =============================================================
-- Pending activation flow: manual store approval after payment
-- =============================================================

-- 1. New columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_message_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by uuid,
  ADD COLUMN IF NOT EXISTS activation_notes text;

-- 2. Index for admin listing
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status
  ON public.profiles (subscription_status)
  WHERE subscription_status = 'pending_activation';

-- 3. RPC: user marks own activation message as sent
CREATE OR REPLACE FUNCTION public.mark_activation_message_sent()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
     SET activation_message_sent_at = COALESCE(activation_message_sent_at, now())
   WHERE id = auth.uid()
     AND subscription_status = 'pending_activation';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_activation_message_sent() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_activation_message_sent() TO authenticated;

-- 4. RPC: admin activates a store
CREATE OR REPLACE FUNCTION public.admin_activate_store(
  target_user_id uuid,
  notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only platform admins can activate stores';
  END IF;

  UPDATE public.profiles
     SET subscription_status = 'active',
         activated_at        = now(),
         activated_by        = v_admin,
         activation_notes    = COALESCE(notes, activation_notes),
         updated_at          = now()
   WHERE id = target_user_id;

  INSERT INTO public.audit_logs (user_id, action, resource, result, metadata)
  VALUES (
    v_admin,
    'store_activated_by_admin',
    'profiles',
    'success',
    jsonb_build_object(
      'admin_id', v_admin,
      'target_user_id', target_user_id,
      'notes', notes
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_activate_store(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_activate_store(uuid, text) TO authenticated;

-- 5. RPC: admin lists pending activations (joins profiles + stores)
CREATE OR REPLACE FUNCTION public.admin_get_pending_activations()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  company_name text,
  email text,
  plan text,
  activation_requested_at timestamptz,
  activation_message_sent_at timestamptz,
  store_id uuid,
  store_name text,
  store_url text,
  platform text,
  store_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only platform admins can list pending activations';
  END IF;

  RETURN QUERY
    SELECT
      p.id                            AS user_id,
      p.full_name,
      p.company_name,
      u.email::text                   AS email,
      p.plan::text                    AS plan,
      p.activation_requested_at,
      p.activation_message_sent_at,
      s.id                            AS store_id,
      s.nome                          AS store_name,
      s.url                           AS store_url,
      s.plataforma                    AS platform,
      NULL::text                      AS store_phone
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT s1.id, s1.nome, s1.url, s1.plataforma
        FROM public.lojas s1
       WHERE s1.user_id = p.id
       ORDER BY s1.criado_em ASC
       LIMIT 1
    ) s ON TRUE
   WHERE p.subscription_status = 'pending_activation'
   ORDER BY p.activation_requested_at ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_pending_activations() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_pending_activations() TO authenticated;