-- ConvertIQ execution loop persistence (insight -> action -> result)

create table if not exists public.convertiq_execution_playbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  diagnostico_id uuid null references public.diagnostics(id) on delete set null,
  action_key text not null,
  action_title text not null,
  owner text null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  planned_week integer null,
  expected_lift_pp numeric(8,2) null,
  expected_impact_reais numeric(14,2) null,
  observed_result text null,
  observed_lift_pp numeric(8,2) null,
  observed_impact_reais numeric(14,2) null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (store_id, action_key)
);

create index if not exists idx_convertiq_playbooks_store on public.convertiq_execution_playbooks (store_id, updated_at desc);
create index if not exists idx_convertiq_playbooks_user on public.convertiq_execution_playbooks (user_id, updated_at desc);

alter table public.convertiq_execution_playbooks enable row level security;

drop policy if exists "convertiq_playbooks_own" on public.convertiq_execution_playbooks;
create policy "convertiq_playbooks_own"
  on public.convertiq_execution_playbooks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
