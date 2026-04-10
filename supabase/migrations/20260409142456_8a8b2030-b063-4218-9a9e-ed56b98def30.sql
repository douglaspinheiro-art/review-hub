
-- Add api_provider column to distinguish Evolution vs Meta Cloud API
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS api_provider text NOT NULL DEFAULT 'evolution'
    CHECK (api_provider IN ('evolution', 'meta'));

-- Meta-specific fields
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS meta_phone_number_id text,
  ADD COLUMN IF NOT EXISTS meta_waba_id text;
