-- Activate automation runtime and seed default journeys.

-- 1) Ensure journeys_config table exists in current schema contract.
create table if not exists public.journeys_config (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  tipo_jornada text not null,
  ativa boolean default false,
  config_json jsonb default '{}'::jsonb,
  kpi_atual numeric(10,2) default 0,
  updated_at timestamptz default now(),
  unique (store_id, tipo_jornada)
);

alter table public.journeys_config enable row level security;
drop policy if exists journeys_config_own on public.journeys_config;
create policy journeys_config_own on public.journeys_config
  for all
  using (
    exists (
      select 1 from public.stores s
      where s.id = journeys_config.store_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = journeys_config.store_id and s.user_id = auth.uid()
    )
  );

-- 2) Seed 7 default journeys for every store.
with base as (
  select
    s.id as store_id,
    j.tipo_jornada,
    j.ativa,
    j.config_json
  from public.stores s
  cross join (
    values
      ('cart_abandoned', true,  '{"delay_minutes":20,"message_template":"Oi {{nome}}! Seu carrinho ainda está reservado. Finalize aqui: {{link}}"}'::jsonb),
      ('reactivation', true,     '{"delay_minutes":60,"message_template":"{{nome}}, sentimos sua falta. Volte com uma oferta especial: {{link}}"}'::jsonb),
      ('birthday', true,         '{"delay_minutes":0,"message_template":"Parabéns, {{nome}}! Preparamos um presente para você hoje: {{link}}"}'::jsonb),
      ('post_purchase', true,    '{"delay_minutes":1440,"message_template":"Obrigado pela compra, {{nome}}! Aqui está um benefício para seu próximo pedido: {{link}}"}'::jsonb),
      ('welcome', true,          '{"delay_minutes":5,"message_template":"Bem-vindo(a), {{nome}}! Confira nossas ofertas iniciais: {{link}}"}'::jsonb),
      ('review_request', true,   '{"delay_minutes":2880,"message_template":"{{nome}}, como foi sua experiência? Sua avaliação é muito importante."}'::jsonb),
      ('winback', true,          '{"delay_minutes":10080,"message_template":"Tem novidade para você, {{nome}}. Reative seu benefício aqui: {{link}}"}'::jsonb)
  ) as j(tipo_jornada, ativa, config_json)
)
insert into public.journeys_config (store_id, tipo_jornada, ativa, config_json, updated_at)
select store_id, tipo_jornada, ativa, config_json, now()
from base
on conflict (store_id, tipo_jornada)
do update set
  ativa = excluded.ativa,
  config_json = excluded.config_json,
  updated_at = now();

-- 3) Best-effort cron activation for Edge Functions.
-- Requires pg_cron + pg_net and secrets in vault:
-- - SUPABASE_URL (or supabase_url)
-- - SUPABASE_SERVICE_ROLE_KEY (or supabase_service_role_key)
do $$
declare
  v_base_url text;
  v_service_key text;
  v_trigger_job_id bigint;
  v_process_job_id bigint;
  v_health_job_id bigint;
begin
  begin
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_net/pg_cron not available. Activate cron manually in Supabase Dashboard.';
    return;
  end;

  begin
    select decrypted_secret
      into v_base_url
    from vault.decrypted_secrets
    where name in ('SUPABASE_URL', 'supabase_url')
    order by case when name = 'SUPABASE_URL' then 0 else 1 end
    limit 1;

    select decrypted_secret
      into v_service_key
    from vault.decrypted_secrets
    where name in ('SUPABASE_SERVICE_ROLE_KEY', 'supabase_service_role_key')
    order by case when name = 'SUPABASE_SERVICE_ROLE_KEY' then 0 else 1 end
    limit 1;
  exception when others then
    raise notice 'Vault not accessible for cron secrets. Activate cron manually.';
    return;
  end;

  if v_base_url is null or v_service_key is null then
    raise notice 'Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in vault. Skipping cron schedule.';
    return;
  end if;

  -- Remove existing jobs with same names.
  select jobid into v_trigger_job_id from cron.job where jobname = 'ltv_trigger_automations' limit 1;
  if v_trigger_job_id is not null then
    perform cron.unschedule(v_trigger_job_id);
  end if;

  select jobid into v_process_job_id from cron.job where jobname = 'ltv_process_scheduled_messages' limit 1;
  if v_process_job_id is not null then
    perform cron.unschedule(v_process_job_id);
  end if;
  select jobid into v_health_job_id from cron.job where jobname = 'ltv_whatsapp_health_check' limit 1;
  if v_health_job_id is not null then
    perform cron.unschedule(v_health_job_id);
  end if;

  -- Trigger journey detection every 5 minutes.
  perform cron.schedule(
    'ltv_trigger_automations',
    '*/5 * * * *',
    format($f$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      );
    $f$, v_base_url || '/functions/v1/trigger-automations', v_service_key)
  );

  -- Process delayed messages + scheduled WhatsApp campaigns every minute.
  perform cron.schedule(
    'ltv_process_scheduled_messages',
    '* * * * *',
    format($f$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      );
    $f$, v_base_url || '/functions/v1/process-scheduled-messages', v_service_key)
  );

  -- Check WhatsApp instance health every 5 minutes.
  perform cron.schedule(
    'ltv_whatsapp_health_check',
    '*/5 * * * *',
    format($f$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      );
    $f$, v_base_url || '/functions/v1/whatsapp-health-check', v_service_key)
  );
end $$;
