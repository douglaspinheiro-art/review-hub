-- Remove qualquer agendamento anterior com mesmo nome (idempotente)
SELECT cron.unschedule('sync-dizy-orders-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-dizy-orders-15min');

-- Agenda a cada 15 minutos
SELECT cron.schedule(
  'sync-dizy-orders-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/sync-dizy-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);