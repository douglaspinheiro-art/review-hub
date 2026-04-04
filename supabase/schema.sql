-- ============================================================
-- LTV Boost — Schema completo
-- Rodar no Supabase > SQL Editor
-- ============================================================

-- Contacts
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

-- Conversations
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

-- Messages
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  content text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status text not null default 'sent' check (status in ('sent','delivered','read','failed')),
  type text not null default 'text' check (type in ('text','image','audio','document','template')),
  created_at timestamptz not null default now()
);

-- Campaigns
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

-- Analytics diário
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

-- Indexes
create index if not exists idx_conversations_contact on conversations(contact_id);
create index if not exists idx_conversations_status on conversations(status);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_messages_created on messages(created_at desc);
create index if not exists idx_analytics_date on analytics_daily(date desc);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger contacts_updated_at before update on contacts
  for each row execute procedure set_updated_at();
create or replace trigger conversations_updated_at before update on conversations
  for each row execute procedure set_updated_at();
create or replace trigger campaigns_updated_at before update on campaigns
  for each row execute procedure set_updated_at();

-- ============================================================
-- Seed data (dados de exemplo para o dashboard)
-- ============================================================

insert into contacts (name, phone, email, tags, status, total_orders, total_spent) values
  ('Maria Silva',    '5511991110001', 'maria@email.com',    array['vip','fidelizado'],    'active', 12, 4800.00),
  ('João Pereira',   '5511991110002', 'joao@email.com',     array['novo'],                'active',  1,  189.90),
  ('Ana Costa',      '5511991110003', 'ana@email.com',      array['vip'],                 'active',  8, 2350.00),
  ('Carlos Lima',    '5511991110004', null,                 array['inativo'],             'inactive',2,  380.00),
  ('Fernanda Rocha', '5511991110005', 'fer@email.com',      array['fidelizado'],          'active',  5, 1200.00),
  ('Ricardo Alves',  '5511991110006', null,                 array['novo'],                'active',  1,  340.00),
  ('Juliana Santos', '5511991110007', 'ju@email.com',       array['vip','fidelizado'],    'active', 15, 6700.00),
  ('Pedro Nunes',    '5511991110008', null,                 array['novo'],                'active',  2,  520.00)
on conflict (phone) do nothing;

insert into campaigns (name, message, status, sent_count, delivered_count, read_count, reply_count, total_contacts, scheduled_at) values
  ('Black Friday 2025',    'Olá {{nome}}! 🔥 Black Friday chegou: 40% OFF em toda a loja! Use BLACKFRIDAY40', 'completed', 1240, 1198, 876, 132, 1240, now() - interval '10 days'),
  ('Carrinho Abandonado',  'Oi {{nome}}, você deixou itens no carrinho 🛒 Finalize com 10% OFF: {{link}}',    'running',    580,  562, 410,  88,  600, null),
  ('Aniversariantes Abril','Feliz aniversário {{nome}}! 🎂 Presente especial: 20% OFF só hoje!',              'scheduled',    0,    0,   0,   0,  340, now() + interval '2 days'),
  ('Reativação Inativos',  '{{nome}}, sentimos sua falta! Volte com 15% de desconto exclusivo 💚',            'draft',        0,    0,   0,   0,    0, null)
on conflict do nothing;

insert into analytics_daily (date, messages_sent, messages_delivered, messages_read, new_contacts, active_conversations, revenue_influenced) values
  (current_date - 30, 120, 115, 89, 4,  12, 3200.00),
  (current_date - 29, 98,  94,  72, 2,  10, 2800.00),
  (current_date - 28, 145, 140, 108,5,  15, 4100.00),
  (current_date - 27, 132, 128, 99, 3,  13, 3750.00),
  (current_date - 26, 167, 160, 124,6,  18, 4900.00),
  (current_date - 25, 89,  85,  66, 1,  9,  2100.00),
  (current_date - 24, 54,  51,  40, 1,  7,  1400.00),
  (current_date - 23, 178, 172, 133,7,  20, 5200.00),
  (current_date - 22, 201, 194, 150,8,  22, 6100.00),
  (current_date - 21, 156, 150, 116,5,  17, 4600.00),
  (current_date - 20, 143, 138, 107,4,  16, 4300.00),
  (current_date - 19, 189, 182, 141,7,  21, 5700.00),
  (current_date - 18, 112, 108, 84, 3,  12, 3400.00),
  (current_date - 17, 67,  64,  50, 2,  8,  1900.00),
  (current_date - 16, 234, 226, 175,9,  26, 7100.00),
  (current_date - 15, 198, 191, 148,7,  22, 5900.00),
  (current_date - 14, 167, 161, 125,5,  18, 5100.00),
  (current_date - 13, 145, 140, 108,4,  16, 4400.00),
  (current_date - 12, 212, 204, 158,8,  24, 6400.00),
  (current_date - 11, 178, 172, 133,6,  20, 5300.00),
  (current_date - 10, 134, 129, 100,4,  15, 4000.00),
  (current_date -  9, 256, 247, 191,10, 29, 7700.00),
  (current_date -  8, 223, 215, 166,8,  25, 6700.00),
  (current_date -  7, 189, 182, 141,7,  21, 5700.00),
  (current_date -  6, 167, 161, 125,5,  18, 5000.00),
  (current_date -  5, 245, 236, 183,9,  28, 7400.00),
  (current_date -  4, 201, 194, 150,7,  23, 6100.00),
  (current_date -  3, 178, 172, 133,6,  20, 5400.00),
  (current_date -  2, 234, 226, 175,8,  26, 7100.00),
  (current_date -  1, 267, 257, 199,10, 30, 8100.00)
on conflict (date) do nothing;
