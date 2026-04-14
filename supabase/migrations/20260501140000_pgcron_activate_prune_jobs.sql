-- 20260501140000_pgcron_activate_prune_jobs.sql
--
-- Agenda jobs pg_cron para retenção periódica.
-- pg_cron está ativo neste projeto (confirmado).
--
-- Jobs:
--   1. prune_api_request_logs_daily  — apaga linhas >7 dias às 03:00 UTC diariamente
--   2. prune_webhook_queue_monthly   — apaga completed/dead_letter >30 dias às 04:00 UTC no 1º do mês
--
-- Idempotente: desagenda job anterior antes de criar (permite rodar múltiplas vezes).

DO $pgcron$
DECLARE
  v_job_id bigint;
BEGIN
  -- ── 1. api_request_logs (rate limiting) — retenção 7 dias ──────────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_api_request_logs_daily') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'prune_api_request_logs_daily' LIMIT 1;
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'prune_api_request_logs_daily',
    '0 3 * * *',
    $cmd$SELECT public.prune_api_request_logs(7)$cmd$
  );

  -- ── 2. webhook_queue completed/dead_letter — retenção 30 dias ──────────────
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_webhook_queue_monthly') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'prune_webhook_queue_monthly' LIMIT 1;
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'prune_webhook_queue_monthly',
    '0 4 1 * *',
    $cmd$
      DELETE FROM public.webhook_queue
      WHERE status IN ('completed', 'dead_letter')
        AND updated_at < now() - interval '30 days'
    $cmd$
  );

  RAISE NOTICE 'pg_cron jobs agendados: prune_api_request_logs_daily (03:00 UTC diário), prune_webhook_queue_monthly (04:00 UTC mensal).';
END;
$pgcron$;
