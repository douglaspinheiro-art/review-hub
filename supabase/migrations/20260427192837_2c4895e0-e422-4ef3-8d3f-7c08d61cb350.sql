-- Drop the old 4-arg overload that conflicts with the new 6-arg version.
DROP FUNCTION IF EXISTS public.write_audit_log(text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.write_audit_log(text, text, uuid, jsonb, text);

-- Re-assert the canonical version (idempotent).
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action text,
  p_resource text,
  p_store_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL,
  p_result text DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, store_id, action, resource, metadata, ip, result)
  VALUES (auth.uid(), p_store_id, p_action, p_resource, p_metadata, p_ip, COALESCE(p_result, 'success'));
END;
$$;