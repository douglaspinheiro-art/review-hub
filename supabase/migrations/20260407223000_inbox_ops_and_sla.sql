-- Inbox operations: assignment, SLA and internal notes.

alter table public.conversations
  add column if not exists sla_due_at timestamptz,
  add column if not exists priority text default 'normal',
  add column if not exists assigned_to_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_priority_check'
  ) then
    alter table public.conversations
      add constraint conversations_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end $$;

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
