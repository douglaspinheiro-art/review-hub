ALTER TABLE public.diagnostics_v3
ADD COLUMN IF NOT EXISTS recommended_plan text;

CREATE INDEX IF NOT EXISTS idx_diagnostics_v3_user_created
  ON public.diagnostics_v3 (user_id, created_at DESC);