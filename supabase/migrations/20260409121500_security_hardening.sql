-- ============================================================
-- Security hardening migration — apply before beta launch
-- Fixes: RLS gaps, missing constraints, schema conflicts
-- ============================================================

-- ── 1. Add UNIQUE constraint on stores.user_id ──────────────
-- The handle_new_user_store trigger uses ON CONFLICT DO NOTHING,
-- which silently fails without this constraint.
alter table public.stores
  add constraint stores_user_id_unique unique (user_id);

-- ── 2. Add user_id to diagnostics_v3 (if not present) ────────
-- Required for Realtime row-level filtering by user.
alter table public.diagnostics_v3
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists diagnostics_v3_user_id_idx on public.diagnostics_v3 (user_id);

-- RLS: users can only read/write their own diagnostics
drop policy if exists "diagnostics_v3_own" on public.diagnostics_v3;
create policy "diagnostics_v3_own" on public.diagnostics_v3
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 3. Fix analytics_daily cross-tenant read vulnerability ───
-- Replace the wildcard policy (any authenticated user can read all rows)
-- with strict ownership enforcement.
drop policy if exists "analytics_daily_own_read" on public.analytics_daily;
drop policy if exists "analytics_daily_select" on public.analytics_daily;
create policy "analytics_daily_own" on public.analytics_daily
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 4. Fix campaigns/contacts null-owner exposure ────────────
-- Belt-and-suspenders: also drop the original permissive policies
-- from phase1-migration.sql if harden_rls was not yet applied.
drop policy if exists "Users can manage own campaigns" on public.campaigns;
drop policy if exists "Enable all for own campaigns" on public.campaigns;
drop policy if exists "campaigns_own" on public.campaigns;
create policy "campaigns_own" on public.campaigns
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can manage own contacts" on public.contacts;
drop policy if exists "Enable all for own contacts" on public.contacts;
drop policy if exists "contacts_own" on public.contacts;
create policy "contacts_own" on public.contacts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 5. Add updated_at trigger to conversations ───────────────
-- Missing in schema.sql; conversations.updated_at was static.
create or replace function public.set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- ── 6. Add profiles.role column if missing ──────────────────
-- Required by system_config_admin_write policy.
alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- ── 7. Ensure profiles has all columns from phase1 ───────────
-- Resolves the schema conflict between schema.sql and phase1-migration.sql.
alter table public.profiles
  add column if not exists plan text not null default 'starter',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists company text;
