-- LTV Boost v4 Automation & Intelligence Infrastructure

-- 1. Orders table (Crucial for RFM and Attribution)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  customer_id uuid references customers_v3(id) on delete cascade,
  external_id text, -- ID from Shopify/Nuvemshop
  total_value numeric(12,2) not null,
  currency text default 'BRL',
  status text not null, -- 'paid', 'pending', 'cancelled'
  items jsonb default '[]',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz default now()
);

-- 2. Scheduled Messages (For the Abandoned Cart Scheduler)
create table if not exists scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  customer_id uuid references customers_v3(id) on delete cascade,
  journey_id uuid, -- Reference to journeys_config if exists
  message_content text not null,
  scheduled_for timestamptz not null,
  status text default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  metadata jsonb default '{}', -- To store things like recovery_url
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- 3. Message Sends Log (Attribution bridge)
create table if not exists message_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  store_id uuid references stores(id) on delete cascade,
  customer_id uuid references customers_v3(id) on delete cascade,
  campaign_id uuid, -- if from manual campaign
  message_id uuid, -- reference to messages table
  phone text not null,
  status text,
  created_at timestamptz default now()
);

-- RLS
alter table orders enable row level security;
alter table scheduled_messages enable row level security;
alter table message_sends enable row level security;

create policy "Users own orders" on orders for all using (auth.uid() = user_id);
create policy "Users own scheduled_messages" on scheduled_messages for all using (auth.uid() = user_id);
create policy "Users own message_sends" on message_sends for all using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_created on orders(created_at);
create index if not exists idx_scheduled_time on scheduled_messages(scheduled_for) where status = 'pending';
create index if not exists idx_message_sends_customer on message_sends(customer_id, created_at);
