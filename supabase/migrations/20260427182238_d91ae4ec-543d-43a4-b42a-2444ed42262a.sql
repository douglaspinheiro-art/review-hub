ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS ga4_access_token text,
  ADD COLUMN IF NOT EXISTS ga4_property_id text;