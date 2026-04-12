-- Agendamento automático de prune para api_request_logs (rate limit distribuído).
-- Requer extensão pg_cron habilitada no projeto Supabase (Supabase Pro).
-- Rodar no SQL Editor uma vez; valida se pg_cron está disponível antes de criar o job.
-- Nota: não usar $$ aninhado com o mesmo tag — quebra o parser do DO $$ ... $$.

do $pgcron$
begin
  -- Verifica se pg_cron está disponível neste ambiente
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    -- Apaga job anterior se existir (idempotente)
    if exists (
      select 1 from cron.job where jobname = 'prune_api_request_logs_daily'
    ) then
      perform cron.unschedule(
        (select jobid from cron.job where jobname = 'prune_api_request_logs_daily' limit 1)
      );
    end if;

    -- Agenda prune diário às 03:00 UTC
    perform cron.schedule(
      'prune_api_request_logs_daily',
      '0 3 * * *',
      $cmd$select public.prune_api_request_logs(7)$cmd$
    );

    raise notice 'pg_cron job "prune_api_request_logs_daily" agendado com sucesso.';
  else
    raise warning
      'pg_cron não está habilitado neste projeto. '
      'Habilite em Supabase Dashboard → Database → Extensions → pg_cron, '
      'ou execute manualmente: select public.prune_api_request_logs(7);';
  end if;
end;
$pgcron$;
