-- ============================================================
-- LTV Boost — Fix Critical Issues v3
-- Aplique este arquivo no Supabase SQL Editor.
-- Todos os comandos são idempotentes (seguros para re-rodar).
-- ============================================================

-- Garantir que set_updated_at existe antes de qualquer trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================
-- BLOCO 0 — Tabelas de dependência (FK targets)
-- Devem existir ANTES dos ALTER TABLE que as referenciam.
-- ============================================================

-- stores (referenciada por quase tudo)
create table if not exists stores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  segment text default 'Outro',
  conversion_health_score integer default 0 check (conversion_health_score between 0 and 100),
  chs_history jsonb default '[]',
  pix_key text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Adicionar pix_key se stores já existia sem ela
alter table stores add column if not exists pix_key text;

-- customers_v3 (referenciada por abandoned_carts e ai_generated_coupons)
create table if not exists customers_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  email text,
  phone text,
  name text,
  birth_date date,
  rfm_recency integer,
  rfm_frequency integer,
  rfm_monetary numeric(12,2),
  rfm_segment text,
  behavioral_profile text,
  preferred_channel text,
  last_purchase_at timestamptz,
  churn_score numeric(3,2) default 0,
  customer_health_score integer default 0 check (customer_health_score between 0 and 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- opportunities (referenciada por prescriptions)
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  root_cause text,
  severity text check (severity in ('critico','alto','medio','oportunidade')),
  estimated_impact numeric(12,2),
  status text check (status in ('novo','snoozed','em_tratamento','resolvido','ignorado')) default 'novo',
  detected_at timestamptz default now(),
  resolved_at timestamptz,
  dados_json jsonb
);

-- prescriptions (referenciada por ai_generated_coupons)
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  opportunity_id uuid references opportunities(id),
  title text not null,
  description text,
  execution_channel text check (execution_channel in ('whatsapp','email','sms','multicanal')),
  segment_target text,
  behavioral_profile_target text,
  num_clients_target integer,
  template_json jsonb,
  discount_value numeric(5,2),
  discount_type text check (discount_type in ('percentual','frete_gratis','fixo')),
  estimated_potential numeric(12,2),
  estimated_roi numeric(6,1),
  status text check (status in ('aguardando_aprovacao','aprovada','em_execucao','concluida','rejeitada')) default 'aguardando_aprovacao',
  created_at timestamptz default now()
);

-- ============================================================
-- BLOCO 1 — Colunas faltantes em tabelas existentes
-- Seguro porque todas as FK targets já existem (BLOCO 0).
-- ============================================================

-- conversations
alter table conversations add column if not exists user_id uuid references auth.users;
alter table conversations add column if not exists store_id uuid references stores(id) on delete cascade;

-- messages
alter table messages add column if not exists user_id uuid references auth.users;
alter table messages add column if not exists external_id text;

-- abandoned_carts
alter table abandoned_carts add column if not exists store_id uuid references stores(id) on delete cascade;
alter table abandoned_carts add column if not exists customer_id uuid references customers_v3(id) on delete set null;

-- analytics_daily
alter table analytics_daily add column if not exists user_id uuid references auth.users;
alter table analytics_daily add column if not exists store_id uuid references stores(id) on delete cascade;

-- message_sends (apenas se a tabela existir)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'message_sends'
  ) then
    execute 'alter table message_sends add column if not exists store_id uuid references stores(id) on delete cascade';
  end if;
end $$;

-- campaigns
alter table campaigns add column if not exists store_id uuid references stores(id) on delete cascade;

-- ============================================================
-- BLOCO 2 — Tabelas ausentes (além das do BLOCO 0)
-- ============================================================

-- system_config
create table if not exists system_config (
  id text primary key,
  maintenance_active boolean not null default false,
  maintenance_message text,
  updated_at timestamptz not null default now()
);

insert into system_config (id, maintenance_active)
values ('config_geral', false)
on conflict (id) do nothing;

-- ai_agent_config
create table if not exists ai_agent_config (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references auth.users not null,
  name text not null default 'Assistente LTV',
  personality text not null default 'professional',
  system_prompt text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ai_agent_config add column if not exists store_id uuid references stores(id) on delete cascade;
alter table ai_agent_config add column if not exists user_id uuid references auth.users;

-- ai_generated_coupons
create table if not exists ai_generated_coupons (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references auth.users not null,
  customer_id uuid references customers_v3(id) on delete set null,
  prescription_id uuid references prescriptions(id) on delete set null,
  code text not null,
  discount_type text check (discount_type in ('percentual','frete_gratis','fixo')) not null,
  discount_value numeric(10,2) not null,
  expires_at timestamptz,
  used_at timestamptz,
  order_id text,
  created_at timestamptz not null default now()
);
alter table ai_generated_coupons add column if not exists store_id uuid references stores(id) on delete cascade;
alter table ai_generated_coupons add column if not exists user_id uuid references auth.users;
alter table ai_generated_coupons add column if not exists code text;

-- benchmark_reports
create table if not exists benchmark_reports (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references auth.users not null,
  period_start date not null,
  period_end date not null,
  sector text,
  overall_score integer check (overall_score between 0 and 100),
  metrics_json jsonb default '{}',
  created_at timestamptz not null default now()
);
-- Caso a tabela já exista (ex: de feedback-loop-benchmark.sql), garantir colunas
alter table benchmark_reports add column if not exists store_id uuid references stores(id) on delete cascade;
alter table benchmark_reports add column if not exists user_id uuid references auth.users;
alter table benchmark_reports add column if not exists period_start date;
alter table benchmark_reports add column if not exists period_end date;
alter table benchmark_reports add column if not exists metrics_json jsonb default '{}';

-- integrations
create table if not exists integrations (
  id uuid default gen_random_uuid() primary key,
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references auth.users not null,
  platform text not null check (platform in ('shopify','nuvemshop','woocommerce','vtex','tray','ga4','custom')),
  status text not null default 'inactive' check (status in ('active','inactive','error','pending')),
  config_json jsonb default '{}',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Caso a tabela já exista, garantir colunas
alter table integrations add column if not exists store_id uuid references stores(id) on delete cascade;
alter table integrations add column if not exists user_id uuid references auth.users;
alter table integrations add column if not exists config_json jsonb default '{}';

-- ============================================================
-- BLOCO 3 — Índices críticos (performance)
-- Cada índice é criado somente se a coluna existe.
-- ============================================================

do $$
begin
  -- analytics_daily(store_id, date)
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='analytics_daily' and column_name='store_id') then
    execute 'create index if not exists idx_analytics_store_date on analytics_daily(store_id, date desc)';
  end if;

  -- analytics_daily(user_id, date)
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='analytics_daily' and column_name='user_id') then
    execute 'create index if not exists idx_analytics_user_date on analytics_daily(user_id, date desc)';
  end if;

  -- contacts(user_id)
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='contacts' and column_name='user_id') then
    execute 'create index if not exists idx_contacts_user on contacts(user_id)';
  end if;

  -- customers_v3
  execute 'create index if not exists idx_customers_store_phone on customers_v3(store_id, phone)';
  execute 'create index if not exists idx_customers_store_email on customers_v3(store_id, email)';

  -- conversations
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='store_id') then
    execute 'create index if not exists idx_conversations_store on conversations(store_id)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='user_id') then
    execute 'create index if not exists idx_conversations_user on conversations(user_id)';
  end if;

  -- messages
  execute 'create index if not exists idx_messages_created_desc on messages(conversation_id, created_at desc)';

  -- abandoned_carts
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='abandoned_carts' and column_name='store_id') then
    execute 'create index if not exists idx_abandoned_carts_store on abandoned_carts(store_id)';
  end if;

  -- benchmark_reports, integrations, coupons
  execute 'create index if not exists idx_benchmark_store on benchmark_reports(store_id, period_end desc)';
  execute 'create index if not exists idx_integrations_store on integrations(store_id)';
  execute 'create index if not exists idx_coupons_store on ai_generated_coupons(store_id)';
  execute 'create index if not exists idx_coupons_code on ai_generated_coupons(code)';
end $$;

-- ============================================================
-- BLOCO 4 — Triggers updated_at
-- ============================================================

create or replace trigger messages_updated_at
  before update on messages
  for each row execute procedure set_updated_at();

create or replace trigger customers_v3_updated_at
  before update on customers_v3
  for each row execute procedure set_updated_at();

create or replace trigger conversations_updated_at
  before update on conversations
  for each row execute procedure set_updated_at();

create or replace trigger ai_agent_config_updated_at
  before update on ai_agent_config
  for each row execute procedure set_updated_at();

create or replace trigger integrations_updated_at
  before update on integrations
  for each row execute procedure set_updated_at();

create or replace trigger stores_updated_at
  before update on stores
  for each row execute procedure set_updated_at();

-- ============================================================
-- BLOCO 5 — RPC Functions ausentes
-- ============================================================

create or replace function increment_unread_count(conv_id uuid)
returns void language plpgsql security definer as $$
begin
  update conversations
  set unread_count = unread_count + 1, updated_at = now()
  where id = conv_id;
end;
$$;

create or replace function increment_daily_analytics_messages(
  p_store_id uuid,
  p_date date,
  p_sent integer default 0,
  p_delivered integer default 0,
  p_read integer default 0
)
returns void language plpgsql security definer as $$
begin
  insert into analytics_daily (store_id, date, messages_sent, messages_delivered, messages_read)
  values (p_store_id, p_date, p_sent, p_delivered, p_read)
  on conflict (store_id, date)
  do update set
    messages_sent      = analytics_daily.messages_sent + excluded.messages_sent,
    messages_delivered = analytics_daily.messages_delivered + excluded.messages_delivered,
    messages_read      = analytics_daily.messages_read + excluded.messages_read;
end;
$$;

-- ============================================================
-- BLOCO 6 — Corrigir RLS
-- ============================================================

-- analytics_daily: política insegura que expunha dados de todos os usuários
drop policy if exists "analytics_read"             on analytics_daily;
drop policy if exists "analytics_insert"           on analytics_daily;
drop policy if exists "Users can view own analytics" on analytics_daily;
drop policy if exists "analytics_own"              on analytics_daily;

alter table analytics_daily enable row level security;
create policy "analytics_own" on analytics_daily
  for all using (auth.uid() = user_id or user_id is null);

-- system_config: leitura pública, escrita apenas admin
alter table system_config enable row level security;
drop policy if exists "system_config_read"         on system_config;
drop policy if exists "system_config_admin_write"  on system_config;
create policy "system_config_read" on system_config
  for select using (true);
create policy "system_config_admin_write" on system_config
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- RLS nas novas tabelas
alter table stores              enable row level security;
alter table customers_v3        enable row level security;
alter table opportunities       enable row level security;
alter table prescriptions       enable row level security;
alter table ai_agent_config     enable row level security;
alter table ai_generated_coupons enable row level security;
alter table benchmark_reports   enable row level security;
alter table integrations        enable row level security;

drop policy if exists "stores_own"              on stores;
drop policy if exists "customers_v3_own"        on customers_v3;
drop policy if exists "opportunities_own"       on opportunities;
drop policy if exists "prescriptions_own"       on prescriptions;
drop policy if exists "ai_agent_config_own"     on ai_agent_config;
drop policy if exists "ai_coupons_own"          on ai_generated_coupons;
drop policy if exists "benchmark_reports_own"   on benchmark_reports;
drop policy if exists "integrations_own"        on integrations;

-- Também remover policies duplicadas do schema.sql se existirem
drop policy if exists "Users can view own stores"        on stores;
drop policy if exists "Users can view own customers"     on customers_v3;
drop policy if exists "Users can view own opportunities" on opportunities;
drop policy if exists "Users can view own prescriptions" on prescriptions;

create policy "stores_own"           on stores           for all using (auth.uid() = user_id);
create policy "customers_v3_own"     on customers_v3     for all using (auth.uid() = user_id);
create policy "opportunities_own"    on opportunities    for all using (auth.uid() = user_id);
create policy "prescriptions_own"    on prescriptions    for all using (auth.uid() = user_id);
create policy "ai_agent_config_own"  on ai_agent_config  for all using (auth.uid() = user_id);
create policy "ai_coupons_own"       on ai_generated_coupons for all using (auth.uid() = user_id);
create policy "benchmark_reports_own" on benchmark_reports for all using (auth.uid() = user_id);
create policy "integrations_own"     on integrations     for all using (auth.uid() = user_id);

-- ============================================================
-- BLOCO 7 — Constraint UNIQUE analytics_daily(store_id, date)
-- ============================================================

alter table analytics_daily drop constraint if exists analytics_daily_date_key;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'analytics_daily'
      and column_name  = 'store_id'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'analytics_daily_store_id_date_key'
  ) then
    -- só adiciona se não existir constraint de mesmo propósito
    if not exists (
      select 1 from pg_indexes
      where tablename = 'analytics_daily'
        and indexname like '%store_id%date%'
    ) then
      alter table analytics_daily
        add constraint analytics_daily_store_id_date_key unique (store_id, date);
    end if;
  end if;
end $$;
