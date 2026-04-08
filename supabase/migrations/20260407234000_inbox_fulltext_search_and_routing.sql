-- Full-history message search (tenant-scoped) + inbox round-robin routing settings.

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

-- Per-tenant round-robin queue (agent display names).
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

-- Atomic pick-next agent for webhook (service role only).
create or replace function public.bump_inbox_round_robin(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  agents text[];
  idx int;
  len int;
  chosen text;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.inbox_routing_settings (user_id, agent_names, round_robin_index)
  values (p_user_id, '{}', 0)
  on conflict (user_id) do nothing;

  select coalesce(agent_names, '{}'), coalesce(round_robin_index, 0)
  into agents, idx
  from public.inbox_routing_settings
  where user_id = p_user_id
  for update;

  len := cardinality(agents);
  if len = 0 then
    return null;
  end if;

  chosen := agents[1 + (idx % len)];
  update public.inbox_routing_settings
    set round_robin_index = idx + 1,
        updated_at = now()
    where user_id = p_user_id;

  return trim(chosen);
end;
$$;

revoke all on function public.bump_inbox_round_robin(uuid) from public;
grant execute on function public.bump_inbox_round_robin(uuid) to service_role;
