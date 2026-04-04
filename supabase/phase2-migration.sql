-- ============================================================
-- LTV Boost — Phase 2 Migration
-- Rodar no Supabase > SQL Editor APÓS a phase1-migration.sql
-- ============================================================

-- 1. AUTOMATIONS (active automation rules per user)
create table if not exists automations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in (
    'cart_abandoned', 'customer_inactive', 'order_delivered',
    'customer_birthday', 'new_contact', 'custom'
  )),
  message_template text not null,
  delay_minutes int not null default 0,
  is_active boolean not null default true,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. REVIEWS (aggregated from Google, Reclame Aqui, etc.)
create table if not exists reviews (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null default 'google' check (platform in ('google', 'reclame_aqui', 'facebook', 'manual')),
  reviewer_name text not null,
  rating int check (rating between 1 and 5),
  content text,
  url text,
  status text not null default 'pending' check (status in ('pending', 'replied', 'ignored')),
  ai_reply text,
  replied_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. REVIEW_REQUESTS (track who we asked to leave a review)
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

-- 4. Indexes
create index if not exists idx_automations_user on automations(user_id);
create index if not exists idx_automations_trigger on automations(trigger);
create index if not exists idx_reviews_user on reviews(user_id);
create index if not exists idx_reviews_status on reviews(status);
create index if not exists idx_reviews_platform on reviews(platform);
create index if not exists idx_review_requests_user on review_requests(user_id);

-- 5. updated_at triggers
create or replace trigger automations_updated_at before update on automations
  for each row execute procedure set_updated_at();
create or replace trigger reviews_updated_at before update on reviews
  for each row execute procedure set_updated_at();

-- 6. Row Level Security
alter table automations enable row level security;
alter table reviews enable row level security;
alter table review_requests enable row level security;

create policy "automations_own" on automations
  for all using (auth.uid() = user_id);

create policy "reviews_own" on reviews
  for all using (auth.uid() = user_id);

create policy "review_requests_own" on review_requests
  for all using (auth.uid() = user_id);

-- 7. Sample data (replace 'YOUR_USER_ID' with a real user UUID after first signup)
-- insert into reviews (user_id, platform, reviewer_name, rating, content, status)
-- values
--   ('YOUR_USER_ID', 'google', 'Maria Silva', 5, 'Excelente atendimento! Recomendo!', 'pending'),
--   ('YOUR_USER_ID', 'google', 'João Costa', 2, 'Produto atrasou muito.', 'pending'),
--   ('YOUR_USER_ID', 'reclame_aqui', 'Ana Lima', 1, 'Produto errado enviado.', 'pending');
