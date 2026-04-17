ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS ga4_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS ga4_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ga4_account_email TEXT;

COMMENT ON COLUMN public.stores.ga4_refresh_token IS 'Google OAuth refresh token for GA4. Should be encrypted at rest via pgcrypto trigger.';
COMMENT ON COLUMN public.stores.ga4_token_expires_at IS 'Expiration timestamp of ga4_access_token. When past, use refresh token to renew.';
COMMENT ON COLUMN public.stores.ga4_account_email IS 'Google account email used to connect GA4 (display only).';