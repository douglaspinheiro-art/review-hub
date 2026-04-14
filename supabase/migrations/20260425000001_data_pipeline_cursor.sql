-- Add cursor for data pipeline pagination
ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS data_pipeline_cursor UUID;
ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS data_pipeline_last_run TIMESTAMPTZ;

-- Ensure there is at least one row in system_config
INSERT INTO public.system_config (id)
SELECT '00000000-0000-0000-0000-000000000000'::UUID
WHERE NOT EXISTS (SELECT 1 FROM public.system_config)
ON CONFLICT DO NOTHING;
