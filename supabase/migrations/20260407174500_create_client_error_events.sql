create table if not exists public.client_error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  message text not null,
  stack text null,
  component_stack text null,
  route text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

alter table public.client_error_events enable row level security;

drop policy if exists "client_error_events_insert_own" on public.client_error_events;
create policy "client_error_events_insert_own"
on public.client_error_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "client_error_events_select_own" on public.client_error_events;
create policy "client_error_events_select_own"
on public.client_error_events
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists idx_client_error_events_created_at
  on public.client_error_events(created_at desc);
