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
      s.name                          AS store_name,
      NULL::text                      AS store_url,
      NULL::text                      AS platform,
      NULL::text                      AS store_phone
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT s1.id, s1.name
        FROM public.stores s1
       WHERE s1.user_id = p.id
       ORDER BY s1.created_at ASC
       LIMIT 1
    ) s ON TRUE
   WHERE p.subscription_status = 'pending_activation'
   ORDER BY p.activation_requested_at ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_pending_activations() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_pending_activations() TO authenticated;