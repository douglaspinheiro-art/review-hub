ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS autopilot_triggered_at timestamptz;

COMMENT ON COLUMN public.prescriptions.autopilot_triggered_at IS
'Marca quando a prescrição foi disparada automaticamente pelo cron revenue-autopilot.';