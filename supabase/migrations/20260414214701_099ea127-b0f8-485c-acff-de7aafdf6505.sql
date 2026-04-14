
-- Encryption function using extensions schema
CREATE OR REPLACE FUNCTION public.encrypt_integration_config(plain_config jsonb, encryption_key text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_encrypt(plain_config::text, encryption_key)
$$;

-- Decryption function using extensions schema
CREATE OR REPLACE FUNCTION public.decrypt_integration_config(encrypted bytea, encryption_key text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(encrypted, encryption_key)::jsonb
$$;
