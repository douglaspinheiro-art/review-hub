-- ============================================================
-- LTV Boost — Schema completo v4 (Standardized & Multi-tenant)
-- ============================================================

-- Profiles (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  role text default 'user',
  created_at timestamptz default now()
);

-- Stores (Lojas)
create table if not exists stores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  segment text default 'Outro',
  conversion_health_score integer default 0 check (conversion_health_score between 0 and 100),
  chs_history jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Contacts (Legacy compatibility, but now multi-tenant)
create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  store_id uuid references stores(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  tags text[] default '{}',
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  notes text,
  total_orders int not null default 0,
  total_spent numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, phone)
);

-- Customers v3 (The new standardized table)
create table if not exists customers_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  email text,
  phone text,
  name text,
  birth_date date,
  -- RFM
  rfm_recency integer,
  rfm_frequency integer,
  rfm_monetary numeric(12,2),
  rfm_segment text,
  -- Behavior
  behavioral_profile text,
  -- Preferences
  preferred_channel text,
  last_purchase_at timestamptz,
  -- Scores
  churn_score numeric(3,2) default 0,
  customer_health_score integer default 0 check (customer_health_score between 0 and 100),
  created_at timestamptz default now(),
  unique (store_id, email),
  unique (store_id, phone)
);

-- Conversations
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  store_id uuid references stores(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed','pending')),
  assigned_to text,
  last_message text,
  last_message_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  conversation_id uuid not null references conversations(id) on delete cascade,
  content text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status text not null default 'sent' check (status in ('sent','delivered','read','failed')),
  type text not null default 'text' check (type in ('text','image','audio','document','template')),
  external_id text,
  created_at timestamptz not null default now()
);

-- Campaigns
create table if not exists campaigns (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
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

-- Daily Analytics
create table if not exists analytics_daily (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  store_id uuid references stores(id) on delete cascade,
  date date not null,
  messages_sent int not null default 0,
  messages_delivered int not null default 0,
  messages_read int not null default 0,
  new_contacts int not null default 0,
  active_conversations int not null default 0,
  revenue_influenced numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, date)
);

-- Opportunities (Problemas)
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

-- Prescriptions (Prescrições)
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

-- Diagnostics v3
create table if not exists diagnostics_v3 (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  diagnostic_json jsonb,
  chs integer,
  chs_label text,
  created_at timestamptz default now()
);

-- WhatsApp Connections
create table if not exists whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  instance_name text not null,
  evolution_api_url text,
  evolution_api_key text,
  status text default 'disconnected',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_contacts_store on contacts(store_id);
create index if not exists idx_customers_v3_store on customers_v3(store_id);
create index if not exists idx_conversations_contact on conversations(contact_id);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_analytics_date on analytics_daily(date desc);
create index if not exists idx_opportunities_store on opportunities(store_id);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger stores_updated_at before update on stores for each row execute procedure set_updated_at();
create or replace trigger contacts_updated_at before update on contacts for each row execute procedure set_updated_at();
create or replace trigger campaigns_updated_at before update on campaigns for each row execute procedure set_updated_at();

-- RLS
alter table profiles enable row level security;
alter table stores enable row level security;
alter table contacts enable row level security;
alter table customers_v3 enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table campaigns enable row level security;
alter table analytics_daily enable row level security;
alter table opportunities enable row level security;
alter table prescriptions enable row level security;
alter table diagnostics_v3 enable row level security;
alter table whatsapp_connections enable row level security;

-- Policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can view own stores" on stores for all using (auth.uid() = user_id);
create policy "Users can view own contacts" on contacts for all using (auth.uid() = user_id);
create policy "Users can view own customers" on customers_v3 for all using (auth.uid() = user_id);
create policy "Users can view own conversations" on conversations for all using (auth.uid() = user_id);
create policy "Users can view own messages" on messages for all using (auth.uid() = user_id);
create policy "Users can view own campaigns" on campaigns for all using (auth.uid() = user_id);
create policy "Users can view own analytics" on analytics_daily for all using (auth.uid() = user_id);
create policy "Users can view own opportunities" on opportunities for all using (auth.uid() = user_id);
create policy "Users can view own prescriptions" on prescriptions for all using (auth.uid() = user_id);
create policy "Users can view own diagnostics" on diagnostics_v3 for all using (exists (select 1 from stores where id = store_id and user_id = auth.uid()));
create policy "Users can view own wa_connections" on whatsapp_connections for all using (auth.uid() = user_id);
