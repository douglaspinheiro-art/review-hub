ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_quality_score TEXT,
  ADD COLUMN IF NOT EXISTS meta_components_updated_at TIMESTAMPTZ;