
-- Habilita extensions necessárias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: lê CRON_SECRET de uma tabela de config (criada se não existir).
-- O usuário precisa popular cron_config com o CRON_SECRET via:
--   insert into cron_config(key, value) values ('cron_secret', '<valor>') on conflict (key) do update set value = excluded.value;
create table if not exists public.cron_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.cron_config enable row level security;
-- Sem políticas: só service_role acessa.

-- Remove jobs antigos (idempotente)
do $$
begin
  perform cron.unschedule('proactive-calendar-monthly');
  exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('reconcile-ga4-attribution-daily');
  exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('revenue-autopilot-weekly');
  exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('calculate-isl-daily');
  exception when others then null;
end $$;

-- 1. proactive-calendar — mensal, dia 1, 09:00 UTC
select cron.schedule(
  'proactive-calendar-monthly',
  '0 9 1 * *',
  $$
  select net.http_post(
    url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/proactive-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.cron_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. reconcile-ga4-attribution — diário, 05:00 UTC
select cron.schedule(
  'reconcile-ga4-attribution-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/reconcile-ga4-attribution',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.cron_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. revenue-autopilot — semanal, segunda 08:00 UTC
select cron.schedule(
  'revenue-autopilot-weekly',
  '0 8 * * 1',
  $$
  select net.http_post(
    url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/revenue-autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.cron_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. calculate-isl — diário, 04:00 UTC, itera por todas as stores ativas
select cron.schedule(
  'calculate-isl-daily',
  '0 4 * * *',
  $$
  select public.calculate_isl(s.id)
  from public.stores s
  where s.user_id is not null;
  $$
);
