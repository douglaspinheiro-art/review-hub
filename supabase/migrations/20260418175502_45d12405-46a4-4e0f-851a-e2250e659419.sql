-- Rebuild the cron so it reads from vault.decrypted_secrets by lowercase name
do $$
begin
  perform cron.unschedule('process-scheduled-messages-every-minute');
exception when others then null;
end $$;

select cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/process-scheduled-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'process_scheduled_messages_secret' limit 1),
        (select decrypted_secret from vault.decrypted_secrets where name = 'PROCESS_SCHEDULED_MESSAGES_SECRET' limit 1),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);