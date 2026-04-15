-- Add OAuth-related columns to whatsapp_connections
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS meta_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_business_id text;