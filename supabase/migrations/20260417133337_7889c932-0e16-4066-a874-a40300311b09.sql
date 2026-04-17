-- Phase B: per-store country code for phone normalization
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'BR';

COMMENT ON COLUMN public.stores.country_code IS
  'ISO 3166-1 alpha-2 country code (BR, PT, AR, MX, etc). Used by webhook normalizers to format phone numbers correctly without assuming Brazil.';

-- Helpful index for webhook lookups by store
CREATE INDEX IF NOT EXISTS idx_stores_country_code ON public.stores(country_code);