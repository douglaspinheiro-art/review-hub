-- Remove any previous version of the job (idempotent)
do $$
begin
  perform cron.unschedule('process-scheduled-messages-every-minute');
exception when others then null;
end $$;

-- Schedule worker every minute, reading the secret from Vault at execution time.
select cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/process-scheduled-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'PROCESS_SCHEDULED_MESSAGES_SECRET' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);