-- ============================================================
-- LTV Boost — Phase 1 Migration
-- Rodar no Supabase > SQL Editor APÓS o schema.sql inicial
-- ============================================================

-- 1. PROFILES (linked to auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  plan text not null default 'starter' check (plan in ('starter','growth','scale','enterprise')),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  onboarding_completed boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. WHATSAPP CONNECTIONS
create table if not exists whatsapp_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  instance_name text not null,
  phone_number text,
  status text not null default 'disconnected' check (status in ('disconnected','connecting','connected','error')),
  evolution_api_url text,
  evolution_api_key text,
  webhook_url text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. CAMPAIGN_SEGMENTS (segmentation rules per campaign)
create table if not exists campaign_segments (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type text not null check (type in ('all','tag','status','rfm','custom')),
  filters jsonb not null default '{}',
  estimated_reach int not null default 0,
  created_at timestamptz not null default now()
);

-- 4. ABANDONED_CARTS (received from e-commerce webhooks)
create table if not exists abandoned_carts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  source text not null default 'shopify' check (source in ('shopify','nuvemshop','tray','vtex','woocommerce','custom')),
  external_id text,
  customer_name text,
  customer_phone text not null,
  customer_email text,
  cart_value numeric(12,2) not null default 0,
  cart_items jsonb not null default '[]',
  recovery_url text,
  status text not null default 'pending' check (status in ('pending','message_sent','recovered','expired')),
  message_sent_at timestamptz,
  recovered_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, external_id)
);

-- 5. Add user_id to campaigns (owner tracking)
alter table campaigns add column if not exists user_id uuid references profiles(id);
alter table campaigns add column if not exists tags text[] default '{}';

-- 6. Add user_id to contacts
alter table contacts add column if not exists user_id uuid references profiles(id);

-- 7. Indexes
create index if not exists idx_profiles_plan on profiles(plan);
create index if not exists idx_whatsapp_user on whatsapp_connections(user_id);
create index if not exists idx_whatsapp_status on whatsapp_connections(status);
create index if not exists idx_abandoned_carts_phone on abandoned_carts(customer_phone);
create index if not exists idx_abandoned_carts_status on abandoned_carts(status);
create index if not exists idx_campaigns_user on campaigns(user_id);
create index if not exists idx_contacts_user on contacts(user_id);

-- 8. updated_at triggers
create or replace trigger profiles_updated_at before update on profiles
  for each row execute procedure set_updated_at();
create or replace trigger whatsapp_connections_updated_at before update on whatsapp_connections
  for each row execute procedure set_updated_at();
create or replace trigger abandoned_carts_updated_at before update on abandoned_carts
  for each row execute procedure set_updated_at();

-- 9. Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, company_name)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'company_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 10. Row Level Security
alter table profiles enable row level security;
alter table whatsapp_connections enable row level security;
alter table campaigns enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table campaign_segments enable row level security;
alter table abandoned_carts enable row level security;
alter table analytics_daily enable row level security;

-- Profiles: user can only see/edit their own profile
create policy "profiles_own" on profiles
  for all using (auth.uid() = id);

-- WhatsApp connections: own only
create policy "whatsapp_own" on whatsapp_connections
  for all using (auth.uid() = user_id);

-- Campaigns: own only
create policy "campaigns_own" on campaigns
  for all using (user_id = auth.uid());

-- Contacts: own only
create policy "contacts_own" on contacts
  for all using (user_id = auth.uid());

-- Conversations: own only
create policy "conversations_own" on conversations
  for all using (
    contact_id in (select id from contacts where user_id = auth.uid())
  );

-- Messages: via conversation ownership
create policy "messages_own" on messages
  for all using (
    conversation_id in (
      select c.id from conversations c
      join contacts ct on c.contact_id = ct.id
      where ct.user_id = auth.uid()
    )
  );

-- Campaign segments: via campaign ownership
create policy "segments_own" on campaign_segments
  for all using (
    campaign_id in (select id from campaigns where user_id = auth.uid())
  );

-- Abandoned carts: own only
create policy "abandoned_carts_own" on abandoned_carts
  for all using (user_id = auth.uid());

-- Analytics: all authenticated users can read (aggregate data)
create policy "analytics_read" on analytics_daily
  for select using (auth.uid() is not null);

create policy "analytics_insert" on analytics_daily
  for insert with check (auth.uid() is not null);
