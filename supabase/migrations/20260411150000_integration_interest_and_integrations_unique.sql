-- integration_interest: registo de interesse em integrações "em breve"
-- integrations: dedupe por utilizador+tipo e índice único para alinhar com upsert na UI

create table if not exists public.integration_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  integration_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, integration_type)
);

create index if not exists idx_integration_interest_user
  on public.integration_interest (user_id);

alter table public.integration_interest enable row level security;

drop policy if exists "integration_interest_select_own" on public.integration_interest;
drop policy if exists "integration_interest_insert_own" on public.integration_interest;
drop policy if exists "integration_interest_update_own" on public.integration_interest;

create policy "integration_interest_select_own"
  on public.integration_interest for select
  using (auth.uid() = user_id);

create policy "integration_interest_insert_own"
  on public.integration_interest for insert
  with check (auth.uid() = user_id);

create policy "integration_interest_update_own"
  on public.integration_interest for update
  using (auth.uid() = user_id);

-- integrations: garantir um registo ativo por (user_id, type) quando as colunas existem
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'type'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'user_id'
  ) then
    with ranked as (
      select id,
        row_number() over (
          partition by user_id, type
          order by created_at desc nulls last, id desc
        ) as rn
      from public.integrations
    )
    delete from public.integrations i
    using ranked r
    where i.id = r.id and r.rn > 1;

    create unique index if not exists integrations_user_id_type_uidx
      on public.integrations (user_id, type);
  end if;
end $$;

-- alargar check de type (incl. dizy) quando aplicável
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'integrations' and column_name = 'type'
  ) then
    alter table public.integrations drop constraint if exists integrations_type_check;

    alter table public.integrations add constraint integrations_type_check check (
      type in (
        'shopify', 'nuvemshop', 'tray', 'vtex', 'woocommerce',
        'hubspot', 'rdstation', 'mailchimp',
        'google_my_business', 'reclame_aqui',
        'zenvia', 'twilio', 'custom', 'dizy'
      )
    );
  end if;
end $$;
