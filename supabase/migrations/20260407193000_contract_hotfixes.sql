-- Contract hotfixes for inbox flows + RLS hardening.

-- Ensure Inbox Ops tables exist even in environments that missed prior migrations.
create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_notes_conversation
  on public.conversation_notes(conversation_id, created_at desc);

alter table public.conversation_notes enable row level security;

drop policy if exists conversation_notes_own on public.conversation_notes;
create policy conversation_notes_own
  on public.conversation_notes
  for all
  using (
    conversation_id in (
      select c.id
      from public.conversations c
      join public.contacts ct on c.contact_id = ct.id
      where ct.user_id = auth.uid()
    )
  )
  with check (
    conversation_id in (
      select c.id
      from public.conversations c
      join public.contacts ct on c.contact_id = ct.id
      where ct.user_id = auth.uid()
    )
  );

create table if not exists public.inbox_routing_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agent_names text[] not null default '{}',
  round_robin_index int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.inbox_routing_settings enable row level security;

drop policy if exists inbox_routing_settings_own on public.inbox_routing_settings;
create policy inbox_routing_settings_own
  on public.inbox_routing_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.search_conversation_ids_by_message(p_search text)
returns table (conversation_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct m.conversation_id
  from public.messages m
  inner join public.conversations c on c.id = m.conversation_id
  where c.user_id = auth.uid()
    and length(trim(coalesce(p_search, ''))) >= 2
    and position(lower(trim(p_search)) in lower(m.content)) > 0
  limit 400;
$$;

revoke all on function public.search_conversation_ids_by_message(text) from public;
grant execute on function public.search_conversation_ids_by_message(text) to authenticated;

-- Remove permissive null-owner reads from webhook logs.
drop policy if exists webhook_logs_own on public.webhook_logs;
create policy webhook_logs_own
  on public.webhook_logs
  for select
  using (auth.uid() = user_id);

-- Hardening RPC privilege surface.
revoke execute on function public.resolve_loyalty_by_phone(text, text) from anon;

-- Guarantee policies on known RLS-enabled tables that often drift.
do $$
begin
  if to_regclass('public.forecast_snapshots') is not null then
    execute 'alter table public.forecast_snapshots enable row level security';
    execute 'drop policy if exists forecast_snapshots_own on public.forecast_snapshots';
    execute 'create policy forecast_snapshots_own on public.forecast_snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;

  if to_regclass('public.journeys_config') is not null then
    execute 'alter table public.journeys_config enable row level security';
    execute 'drop policy if exists journeys_config_own on public.journeys_config';
    execute 'create policy journeys_config_own on public.journeys_config for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;

  if to_regclass('public.loyalty_config') is not null then
    execute 'alter table public.loyalty_config enable row level security';
    execute 'drop policy if exists loyalty_config_own on public.loyalty_config';
    execute 'create policy loyalty_config_own on public.loyalty_config for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;

  if to_regclass('public.loyalty_points_v3') is not null then
    execute 'alter table public.loyalty_points_v3 enable row level security';
    execute 'drop policy if exists loyalty_points_v3_own on public.loyalty_points_v3';
    execute 'create policy loyalty_points_v3_own on public.loyalty_points_v3 for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;

  if to_regclass('public.loyalty_rewards') is not null then
    execute 'alter table public.loyalty_rewards enable row level security';
    execute 'drop policy if exists loyalty_rewards_own on public.loyalty_rewards';
    execute 'create policy loyalty_rewards_own on public.loyalty_rewards for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;
