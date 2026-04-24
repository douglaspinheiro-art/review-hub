ALTER TABLE public.diagnostics_v3
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS previous_diagnostic_id uuid,
  ADD COLUMN IF NOT EXISTS week_over_week jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diagnostics_v3_trigger_source_check'
  ) THEN
    ALTER TABLE public.diagnostics_v3
      ADD CONSTRAINT diagnostics_v3_trigger_source_check
      CHECK (trigger_source IN ('manual','weekly','onboarding'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diagnostics_v3_previous_fk'
  ) THEN
    ALTER TABLE public.diagnostics_v3
      ADD CONSTRAINT diagnostics_v3_previous_fk
      FOREIGN KEY (previous_diagnostic_id)
      REFERENCES public.diagnostics_v3(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diagnostics_v3_user_trigger_created
  ON public.diagnostics_v3 (user_id, trigger_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostics_v3_store_created
  ON public.diagnostics_v3 (store_id, created_at DESC);