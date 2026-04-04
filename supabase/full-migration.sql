-- ============================================================
-- LTV Boost — Migração Completa (all-in-one)
-- Use este arquivo para um setup limpo do zero.
-- Todos os comandos são idempotentes (seguros para re-rodar).
-- ============================================================

-- ============================================================
-- BLOCO 1 — Função utilitária
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================
-- BLOCO 2 — Tabelas base
-- ============================================================

create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  phone text not null unique,
  email text,
  tags text[] default '{}',
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  notes text,
  total_orders int not null default 0,
  total_spent numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed','pending')),
  assigned_to text,
  last_message text,
  last_message_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  content text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status text not null default 'sent' check (status in ('sent','delivered','read','failed')),
  type text not null default 'text' check (type in ('text','image','audio','document','template')),
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  message text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','running','completed','paused','failed')),
  scheduled_at timestamptz,
  sent_count int not null default 0,
  delivered_count int not null default 0,
  read_count int not null default 0,
  reply_count int not null default 0,
  total_contacts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics_daily (
  id uuid default gen_random_uuid() primary key,
  date date not null unique,
  messages_sent int not null default 0,
  messages_delivered int not null default 0,
  messages_read int not null default 0,
  new_contacts int not null default 0,
  active_conversations int not null default 0,
  revenue_influenced numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes base
create index if not exists idx_conversations_contact on conversations(contact_id);
create index if not exists idx_conversations_status on conversations(status);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_messages_created on messages(created_at desc);
create index if not exists idx_analytics_date on analytics_daily(date desc);

-- Triggers base
create or replace trigger contacts_updated_at before update on contacts
  for each row execute procedure set_updated_at();
create or replace trigger conversations_updated_at before update on conversations
  for each row execute procedure set_updated_at();
create or replace trigger campaigns_updated_at before update on campaigns
  for each row execute procedure set_updated_at();

-- ============================================================
-- BLOCO 3 — Phase 1 (profiles, whatsapp, carrinho, RLS)
-- ============================================================

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

create table if not exists campaign_segments (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type text not null check (type in ('all','tag','status','rfm','custom')),
  filters jsonb not null default '{}',
  estimated_reach int not null default 0,
  created_at timestamptz not null default now()
);

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

-- Colunas adicionais em tabelas existentes
alter table campaigns add column if not exists user_id uuid references profiles(id);
alter table campaigns add column if not exists tags text[] default '{}';
alter table contacts  add column if not exists user_id uuid references profiles(id);

-- Indexes phase 1
create index if not exists idx_profiles_plan       on profiles(plan);
create index if not exists idx_whatsapp_user        on whatsapp_connections(user_id);
create index if not exists idx_whatsapp_status      on whatsapp_connections(status);
create index if not exists idx_abandoned_carts_phone on abandoned_carts(customer_phone);
create index if not exists idx_abandoned_carts_status on abandoned_carts(status);
create index if not exists idx_campaigns_user        on campaigns(user_id);
create index if not exists idx_contacts_user         on contacts(user_id);

-- Triggers phase 1
create or replace trigger profiles_updated_at before update on profiles
  for each row execute procedure set_updated_at();
create or replace trigger whatsapp_connections_updated_at before update on whatsapp_connections
  for each row execute procedure set_updated_at();
create or replace trigger abandoned_carts_updated_at before update on abandoned_carts
  for each row execute procedure set_updated_at();

-- Auto-criar profile no signup (Security Definer é CRUCIAL aqui)
create or replace function public.handle_new_user()
returns trigger 
language plpgsql 
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, company_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- RLS phase 1
alter table profiles           enable row level security;
alter table whatsapp_connections enable row level security;
alter table campaigns          enable row level security;
alter table contacts           enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table campaign_segments  enable row level security;
alter table abandoned_carts    enable row level security;
alter table analytics_daily    enable row level security;

drop policy if exists "profiles_own"          on profiles;
drop policy if exists "whatsapp_own"          on whatsapp_connections;
drop policy if exists "campaigns_own"         on campaigns;
drop policy if exists "contacts_own"          on contacts;
drop policy if exists "conversations_own"     on conversations;
drop policy if exists "messages_own"          on messages;
drop policy if exists "segments_own"          on campaign_segments;
drop policy if exists "abandoned_carts_own"   on abandoned_carts;
drop policy if exists "analytics_read"        on analytics_daily;
drop policy if exists "analytics_insert"      on analytics_daily;

create policy "profiles_own" on profiles
  for all using (auth.uid() = id);

create policy "whatsapp_own" on whatsapp_connections
  for all using (auth.uid() = user_id);

create policy "campaigns_own" on campaigns
  for all using (user_id = auth.uid() or user_id is null);

create policy "contacts_own" on contacts
  for all using (user_id = auth.uid() or user_id is null);

create policy "conversations_own" on conversations
  for all using (
    contact_id in (select id from contacts where user_id = auth.uid() or user_id is null)
  );

create policy "messages_own" on messages
  for all using (
    conversation_id in (
      select c.id from conversations c
      join contacts ct on c.contact_id = ct.id
      where ct.user_id = auth.uid() or ct.user_id is null
    )
  );

create policy "segments_own" on campaign_segments
  for all using (
    campaign_id in (select id from campaigns where user_id = auth.uid() or user_id is null)
  );

create policy "abandoned_carts_own" on abandoned_carts
  for all using (user_id = auth.uid() or user_id is null);

create policy "analytics_read" on analytics_daily
  for select using (auth.uid() is not null);

create policy "analytics_insert" on analytics_daily
  for insert with check (auth.uid() is not null);

-- ============================================================
-- BLOCO 4 — Phase 2 (automações, reviews)
-- ============================================================

create table if not exists automations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in (
    'cart_abandoned','customer_inactive','order_delivered',
    'customer_birthday','new_contact','custom'
  )),
  message_template text not null,
  delay_minutes int not null default 0,
  is_active boolean not null default true,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null default 'google' check (platform in ('google','reclame_aqui','facebook','manual')),
  reviewer_name text not null,
  rating int check (rating between 1 and 5),
  content text,
  url text,
  status text not null default 'pending' check (status in ('pending','replied','ignored')),
  ai_reply text,
  replied_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists review_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid references contacts(id),
  order_id text,
  platform text not null default 'google',
  message_sent_at timestamptz,
  clicked_at timestamptz,
  review_left boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes phase 2
create index if not exists idx_automations_user    on automations(user_id);
create index if not exists idx_automations_trigger on automations(trigger);
create index if not exists idx_reviews_user        on reviews(user_id);
create index if not exists idx_reviews_status      on reviews(status);
create index if not exists idx_reviews_platform    on reviews(platform);
create index if not exists idx_review_requests_user on review_requests(user_id);

-- Triggers phase 2
create or replace trigger automations_updated_at before update on automations
  for each row execute procedure set_updated_at();
create or replace trigger reviews_updated_at before update on reviews
  for each row execute procedure set_updated_at();

-- RLS phase 2
alter table automations    enable row level security;
alter table reviews        enable row level security;
alter table review_requests enable row level security;

drop policy if exists "automations_own"      on automations;
drop policy if exists "reviews_own"          on reviews;
drop policy if exists "review_requests_own"  on review_requests;

create policy "automations_own" on automations
  for all using (auth.uid() = user_id);

create policy "reviews_own" on reviews
  for all using (auth.uid() = user_id);

create policy "review_requests_own" on review_requests
  for all using (auth.uid() = user_id);

-- ============================================================
-- BLOCO 5 — Seed data (dados de exemplo)
-- ============================================================

insert into contacts (name, phone, email, tags, status, total_orders, total_spent) values
  ('Maria Silva',    '5511991110001', 'maria@email.com', array['vip','fidelizado'], 'active',   12, 4800.00),
  ('João Pereira',   '5511991110002', 'joao@email.com',  array['novo'],             'active',    1,  189.90),
  ('Ana Costa',      '5511991110003', 'ana@email.com',   array['vip'],              'active',    8, 2350.00),
  ('Carlos Lima',    '5511991110004', null,              array['inativo'],          'inactive',  2,  380.00),
  ('Fernanda Rocha', '5511991110005', 'fer@email.com',   array['fidelizado'],       'active',    5, 1200.00),
  ('Ricardo Alves',  '5511991110006', null,              array['novo'],             'active',    1,  340.00),
  ('Juliana Santos', '5511991110007', 'ju@email.com',    array['vip','fidelizado'], 'active',   15, 6700.00),
  ('Pedro Nunes',    '5511991110008', null,              array['novo'],             'active',    2,  520.00)
on conflict (phone) do nothing;

insert into campaigns (name, message, status, sent_count, delivered_count, read_count, reply_count, total_contacts, scheduled_at) values
  ('Black Friday 2025',    'Olá {{nome}}! 🔥 Black Friday chegou: 40% OFF em toda a loja! Use BLACKFRIDAY40',     'completed', 1240, 1198, 876, 132, 1240, now() - interval '10 days'),
  ('Carrinho Abandonado',  'Oi {{nome}}, você deixou itens no carrinho 🛒 Finalize com 10% OFF: {{link}}',         'running',    580,  562, 410,  88,  600, null),
  ('Aniversariantes Abril','Feliz aniversário {{nome}}! 🎂 Presente especial: 20% OFF só hoje!',                   'scheduled',    0,    0,   0,   0,  340, now() + interval '2 days'),
  ('Reativação Inativos',  '{{nome}}, sentimos sua falta! Volte com 15% de desconto exclusivo 💚',                 'draft',        0,    0,   0,   0,    0, null)
on conflict do nothing;

insert into analytics_daily (date, messages_sent, messages_delivered, messages_read, new_contacts, active_conversations, revenue_influenced) values
  (current_date - 30, 120, 115,  89, 4, 12, 3200.00), (current_date - 29,  98,  94,  72, 2, 10, 2800.00),
  (current_date - 28, 145, 140, 108, 5, 15, 4100.00), (current_date - 27, 132, 128,  99, 3, 13, 3750.00),
  (current_date - 26, 167, 160, 124, 6, 18, 4900.00), (current_date - 25,  89,  85,  66, 1,  9, 2100.00),
  (current_date - 24,  54,  51,  40, 1,  7, 1400.00), (current_date - 23, 178, 172, 133, 7, 20, 5200.00),
  (current_date - 22, 201, 194, 150, 8, 22, 6100.00), (current_date - 21, 156, 150, 116, 5, 17, 4600.00),
  (current_date - 20, 143, 138, 107, 4, 16, 4300.00), (current_date - 19, 189, 182, 141, 7, 21, 5700.00),
  (current_date - 18, 112, 108,  84, 3, 12, 3400.00), (current_date - 17,  67,  64,  50, 2,  8, 1900.00),
  (current_date - 16, 234, 226, 175, 9, 26, 7100.00), (current_date - 15, 198, 191, 148, 7, 22, 5900.00),
  (current_date - 14, 167, 161, 125, 5, 18, 5100.00), (current_date - 13, 145, 140, 108, 4, 16, 4400.00),
  (current_date - 12, 212, 204, 158, 8, 24, 6400.00), (current_date - 11, 178, 172, 133, 6, 20, 5300.00),
  (current_date - 10, 134, 129, 100, 4, 15, 4000.00), (current_date -  9, 256, 247, 191,10, 29, 7700.00),
  (current_date -  8, 223, 215, 166, 8, 25, 6700.00), (current_date -  7, 189, 182, 141, 7, 21, 5700.00),
  (current_date -  6, 167, 161, 125, 5, 18, 5000.00), (current_date -  5, 245, 236, 183, 9, 28, 7400.00),
  (current_date -  4, 201, 194, 150, 7, 23, 6100.00), (current_date -  3, 178, 172, 133, 6, 20, 5400.00),
  (current_date -  2, 234, 226, 175, 8, 26, 7100.00), (current_date -  1, 267, 257, 199,10, 30, 8100.00)
on conflict (date) do nothing;

-- ============================================================
-- BLOCO 6 — Phase 5 (orders, RFM, loyalty, AI)
-- ============================================================

create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  external_order_id text,
  total_amount numeric(12,2) not null default 0,
  currency text default 'BRL',
  status text not null default 'pending',
  items_count int default 0,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_contact on orders(contact_id);
create index if not exists idx_orders_user    on orders(user_id);
create index if not exists idx_orders_status  on orders(status);

alter table orders enable row level security;
drop policy if exists "orders_own" on orders;
create policy "orders_own" on orders for all using (auth.uid() = user_id);

alter table profiles add column if not exists knowledge_base text;
alter table profiles add column if not exists ai_model text default 'gpt-4o-mini';
alter table profiles add column if not exists loyalty_program_name text default 'Clube VIP';
alter table profiles add column if not exists points_per_real int default 1;

alter table contacts add column if not exists rfm_segment text default 'new';
alter table contacts add column if not exists loyalty_points int default 0;
alter table contacts add column if not exists loyalty_tier text default 'Bronze';

create or replace function update_contact_metrics()
returns trigger language plpgsql as $$
declare
  total_count int;
  total_val numeric(12,2);
  days_since_join int;
  recency_score numeric(4,2);
  freq_score numeric(4,2);
  val_score numeric(4,2);
  rfm_score numeric(4,2);
  max_orders int;
  max_spent numeric(12,2);
  new_segment text;
  new_points int;
  new_tier text;
  pts_per_real int;
begin
  select count(*), sum(total_amount)
  into total_count, total_val
  from orders
  where contact_id = coalesce(new.contact_id, old.contact_id)
    and status in ('paid', 'shipped', 'delivered');

  total_count := coalesce(total_count, 0);
  total_val := coalesce(total_val, 0);

  select points_per_real into pts_per_real 
  from profiles 
  where id = (select user_id from contacts where id = coalesce(new.contact_id, old.contact_id));
  
  pts_per_real := coalesce(pts_per_real, 1);
  new_points := floor(total_val * pts_per_real);

  if new_points >= 5000 then new_tier := 'Diamante';
  elsif new_points >= 1500 then new_tier := 'Ouro';
  elsif new_points >= 500 then new_tier := 'Prata';
  else new_tier := 'Bronze';
  end if;

  select max(total_orders), max(total_spent) into max_orders, max_spent from contacts;
  max_orders := coalesce(nullif(max_orders, 0), 10);
  max_spent := coalesce(nullif(max_spent, 0), 1000);

  select extract(day from (now() - created_at)) into days_since_join from contacts where id = coalesce(new.contact_id, old.contact_id);
  
  recency_score := max(0, 1 - (days_since_join / 365.0)); 
  freq_score := min(1, total_count / max_orders::numeric);
  val_score := min(1, total_val / max_spent::numeric);
  
  rfm_score := (recency_score + freq_score + val_score) / 3.0;

  if total_count <= 2 and days_since_join < 90 then
    new_segment := 'new';
  elsif rfm_score >= 0.55 and total_count >= 5 then
    new_segment := 'champions';
  elsif rfm_score >= 0.3 then
    new_segment := 'loyal';
  elsif rfm_score < 0.1 then
    new_segment := 'lost';
  else
    new_segment := 'at_risk';
  end if;

  update contacts
  set 
    total_orders = total_count,
    total_spent = total_val,
    rfm_segment = new_segment,
    loyalty_points = new_points,
    loyalty_tier = new_tier,
    status = case when status = 'inactive' and total_count > 0 then 'active' else status end,
    updated_at = now()
  where id = coalesce(new.contact_id, old.contact_id);

  return new;
end;
$$;

drop trigger if exists on_order_change on orders;
create trigger on_order_change
  after insert or update or delete on orders
  for each row execute procedure update_contact_metrics();

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at before update on orders
  for each row execute procedure set_updated_at();

create or replace function sync_order_to_analytics()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT' and new.status in ('paid', 'shipped', 'delivered')) or
     (TG_OP = 'UPDATE' and new.status in ('paid', 'shipped', 'delivered') and old.status not in ('paid', 'shipped', 'delivered')) then
    
    insert into analytics_daily (date, revenue_influenced)
    values (current_date, new.total_amount)
    on conflict (date) do update
    set revenue_influenced = analytics_daily.revenue_influenced + excluded.revenue_influenced;
    
  end if;
  return new;
end;
$$;

drop trigger if exists on_order_paid_analytics on orders;
create trigger on_order_paid_analytics
  after insert or update on orders
  for each row execute procedure sync_order_to_analytics();
