-- ============================================================
-- LTV Boost — Phase 3 Migration
-- Rodar APÓS phase2-migration.sql
-- ============================================================

-- 1. API KEYS
create table if not exists api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  key_prefix text not null,                   -- ex: "chb_live_"
  key_hash text not null,                     -- bcrypt hash da chave completa
  key_preview text not null,                  -- ex: "chb_live_••••••1a2b"
  environment text not null default 'production' check (environment in ('production','sandbox')),
  scopes text[] not null default array['read','write'],
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. WHITE_LABEL (agency branding)
create table if not exists white_label (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique references profiles(id) on delete cascade,
  brand_name text,
  brand_logo_url text,
  primary_color text default '#7c3aed',
  custom_domain text,
  hide_conversahub_branding boolean not null default false,
  support_email text,
  support_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. SMS_CONNECTIONS
create table if not exists sms_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null default 'zenvia' check (provider in ('zenvia','twilio','infobip','custom')),
  api_key text,
  api_secret text,
  sender_id text,
  is_active boolean not null default false,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. INTEGRATIONS (marketplace)
create table if not exists integrations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in (
    'shopify','nuvemshop','tray','vtex','woocommerce',
    'hubspot','rdstation','mailchimp',
    'google_my_business','reclame_aqui',
    'zenvia','twilio','custom'
  )),
  name text not null,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. WEBHOOK_LOGS (audit trail)
create table if not exists webhook_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  source text not null,
  event_type text not null,
  payload jsonb,
  status text not null default 'received' check (status in ('received','processed','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_api_keys_user     on api_keys(user_id);
create index if not exists idx_api_keys_active   on api_keys(is_active);
create index if not exists idx_white_label_user  on white_label(user_id);
create index if not exists idx_sms_connections_user on sms_connections(user_id);
create index if not exists idx_integrations_user on integrations(user_id);
create index if not exists idx_integrations_type on integrations(type);
create index if not exists idx_webhook_logs_user on webhook_logs(user_id);
create index if not exists idx_webhook_logs_created on webhook_logs(created_at desc);

-- Triggers
create or replace trigger white_label_updated_at before update on white_label
  for each row execute procedure set_updated_at();
create or replace trigger sms_connections_updated_at before update on sms_connections
  for each row execute procedure set_updated_at();
create or replace trigger integrations_updated_at before update on integrations
  for each row execute procedure set_updated_at();

-- RLS
alter table api_keys        enable row level security;
alter table white_label     enable row level security;
alter table sms_connections enable row level security;
alter table integrations    enable row level security;
alter table webhook_logs    enable row level security;

drop policy if exists "api_keys_own"        on api_keys;
drop policy if exists "white_label_own"     on white_label;
drop policy if exists "sms_connections_own" on sms_connections;
drop policy if exists "integrations_own"    on integrations;
drop policy if exists "webhook_logs_own"    on webhook_logs;

create policy "api_keys_own"        on api_keys        for all using (auth.uid() = user_id);
create policy "white_label_own"     on white_label     for all using (auth.uid() = user_id);
create policy "sms_connections_own" on sms_connections for all using (auth.uid() = user_id);
create policy "integrations_own"    on integrations    for all using (auth.uid() = user_id);
create policy "webhook_logs_own"    on webhook_logs    for all using (auth.uid() = user_id or user_id is null);
