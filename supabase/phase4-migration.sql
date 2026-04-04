-- ============================================================
-- LTV Boost — Phase 4 Migration
-- Rodar APÓS phase3-migration.sql
-- ============================================================

-- 1. TEAM_MEMBERS
create table if not exists team_members (
  id uuid default gen_random_uuid() primary key,
  account_owner_id uuid not null references profiles(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid references profiles(id) on delete set null,
  role text not null default 'operator' check (role in ('admin','operator','viewer')),
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (account_owner_id, invited_email)
);

-- 2. AFFILIATE_REFERRALS
create table if not exists affiliate_referrals (
  id uuid default gen_random_uuid() primary key,
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_email text not null,
  referred_user_id uuid references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','trial','converted','paid')),
  commission_pct numeric not null default 20,
  commission_brl numeric,
  plan_name text,
  converted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. NOTIFICATIONS
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in (
    'cart_recovered','new_review','campaign_done','payment',
    'team_invite','system','low_credits','new_contact'
  )),
  title text not null,
  body text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_team_members_owner   on team_members(account_owner_id);
create index if not exists idx_team_members_email   on team_members(invited_email);
create index if not exists idx_affiliates_referrer  on affiliate_referrals(referrer_id);
create index if not exists idx_affiliates_status    on affiliate_referrals(status);
create index if not exists idx_notifications_user   on notifications(user_id);
create index if not exists idx_notifications_unread on notifications(user_id, read_at) where read_at is null;
create index if not exists idx_notifications_created on notifications(created_at desc);

-- RLS
alter table team_members        enable row level security;
alter table affiliate_referrals enable row level security;
alter table notifications       enable row level security;

drop policy if exists "team_members_own"   on team_members;
drop policy if exists "affiliates_own"     on affiliate_referrals;
drop policy if exists "notifications_own"  on notifications;

create policy "team_members_own"  on team_members
  for all using (auth.uid() = account_owner_id or auth.uid() = invited_user_id);
create policy "affiliates_own"    on affiliate_referrals
  for all using (auth.uid() = referrer_id);
create policy "notifications_own" on notifications
  for all using (auth.uid() = user_id);

-- Seed: demo notifications (user_id null = visible to all via policy exception below)
-- Note: for demo data use the trigger approach or insert with real user_id after signup
