
-- Add next_retry_at column for exponential backoff
ALTER TABLE public.webhook_queue
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz DEFAULT now();

-- Index to efficiently query retryable jobs
CREATE INDEX IF NOT EXISTS idx_webhook_queue_retry
  ON public.webhook_queue (status, next_retry_at)
  WHERE status = 'pending';

-- Integration health summary RPC (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.integration_health_summary(p_store_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'pending_count',
      (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'pending'),
    'processing_count',
      (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'processing'),
    'dead_letter_7d',
      (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'dead_letter' AND created_at > now() - interval '7 days'),
    'completed_7d',
      (SELECT count(*) FROM webhook_queue WHERE store_id = p_store_id AND status = 'completed' AND updated_at > now() - interval '7 days'),
    'avg_processing_ms',
      (SELECT coalesce(
        round(extract(epoch from avg(processed_at - created_at)) * 1000),
        0
      ) FROM webhook_queue WHERE store_id = p_store_id AND status = 'completed' AND processed_at IS NOT NULL AND created_at > now() - interval '7 days'),
    'last_success_at',
      (SELECT max(processed_at) FROM webhook_queue WHERE store_id = p_store_id AND status = 'completed')
  );
$$;
