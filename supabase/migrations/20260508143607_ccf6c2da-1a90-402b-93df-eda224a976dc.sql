ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS google_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS google_business_location_id TEXT;

COMMENT ON COLUMN public.stores.google_business_account_id IS 'Google Business Profile account ID (e.g. accounts/123). Used by sync-google-reviews.';
COMMENT ON COLUMN public.stores.google_business_location_id IS 'Google Business Profile location ID (e.g. locations/456). Used by sync-google-reviews.';