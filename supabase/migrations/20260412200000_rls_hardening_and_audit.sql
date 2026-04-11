-- Production Readiness: RLS Hardening & Audit Infrastructure

-- 1. Audit Logs Table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  store_id uuid references public.stores(id),
  action text not null,
  resource text not null,
  metadata jsonb default '{}',
  ip text
);

-- Legacy installs may already have audit_logs without these columns; CREATE TABLE IF NOT EXISTS skips them.
alter table public.audit_logs add column if not exists store_id uuid references public.stores(id);
alter table public.audit_logs add column if not exists user_id uuid references auth.users(id);
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists resource text;
alter table public.audit_logs add column if not exists metadata jsonb default '{}';
alter table public.audit_logs add column if not exists ip text;
alter table public.audit_logs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_audit_logs_store_id on public.audit_logs(store_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);

alter table public.audit_logs enable row level security;
drop policy if exists "Owners can view own audit logs" on public.audit_logs;
create policy "Owners can view own audit logs" on public.audit_logs
  for select using (auth.uid() = (select user_id from stores where id = store_id));

-- 2. Audit Function
create or replace function public.write_audit_log(
  p_action text,
  p_resource text,
  p_store_id uuid,
  p_metadata jsonb default '{}',
  p_ip text default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.audit_logs (user_id, store_id, action, resource, metadata, ip)
  values (auth.uid(), p_store_id, p_action, p_resource, p_metadata, p_ip);
end;
$$;

-- 3. RLS Hardening for team_members
-- Only owner can DELETE team members
drop policy if exists team_members_owner_all on public.team_members;
create policy team_members_owner_manage on public.team_members
  for all to authenticated
  using (account_owner_id = (select auth.uid()))
  with check (account_owner_id = (select auth.uid()));

-- 4. RLS Hardening for stores
-- Collaborators can READ but not UPDATE/DELETE sensitive fields or the store itself
-- Already have stores_update_owner which uses user_id = auth.uid()

-- 5. WhatsApp Connections Health
alter table public.whatsapp_connections 
  add column if not exists health_status text default 'unknown' check (health_status in ('healthy', 'unauthorized', 'degraded', 'unknown', 'rate_limited')),
  add column if not exists health_details jsonb default '{}',
  add column if not exists last_health_check_at timestamptz;

-- 6. Trigger for basic auditing on stores
create or replace function public.audit_store_changes()
returns trigger as $$
begin
  perform public.write_audit_log(
    'update_store',
    'stores',
    new.id,
    jsonb_build_object('old', old, 'new', new)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_audit_store_changes on public.stores;
create trigger trg_audit_store_changes
  after update on public.stores
  for each row execute function public.audit_store_changes();
