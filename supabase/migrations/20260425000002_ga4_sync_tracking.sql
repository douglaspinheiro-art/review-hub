-- Add cursor and quota tracking for GA4 sync
ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS ga4_sync_cursor UUID;
ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS ga4_sync_last_run TIMESTAMPTZ;
ALTER TABLE public.system_config ADD COLUMN IF NOT EXISTS ga4_sync_daily_count INT DEFAULT 0;
