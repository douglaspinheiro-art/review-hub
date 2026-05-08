ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_external_id_uniq
  ON public.reviews (platform, external_id)
  WHERE external_id IS NOT NULL;