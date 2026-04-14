-- Migration: scheduled_messages_archive table + pg_cron nightly archival job
-- Purpose: Prevent unbounded growth of scheduled_messages by archiving sent rows older than 90 days.
-- Safe to apply multiple times (idempotent).

-- ── 1. Archive table ──────────────────────────────────────────────────────────

create table if not exists public.scheduled_messages_archive (
  like public.scheduled_messages including all
);

-- RLS: same owner-based policy as the source table
alter table public.scheduled_messages_archive enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'scheduled_messages_archive'
      and policyname = 'owner_access_archive'
  ) then
    execute $pol$
      create policy owner_access_archive
        on public.scheduled_messages_archive
        for all
        using (user_id = auth.uid())
    $pol$;
  end if;
end;
$$;

-- ── 2. Archival RPC ───────────────────────────────────────────────────────────

create or replace function public.archive_old_scheduled_messages(
  retention_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff  timestamptz := now() - (retention_days || ' days')::interval;
  v_count   integer;
begin
  -- Insert rows older than cutoff that have a terminal status
  insert into public.scheduled_messages_archive
  select *
  from   public.scheduled_messages
  where  status in ('sent', 'failed', 'dead_letter')
    and  created_at < v_cutoff
  on conflict do nothing;

  get diagnostics v_count = row_count;

  -- Delete the archived rows from the live table
  delete from public.scheduled_messages
  where  status in ('sent', 'failed', 'dead_letter')
    and  created_at < v_cutoff;

  return v_count;
end;
$$;

comment on function public.archive_old_scheduled_messages(integer) is
  'Moves sent/failed/dead_letter rows older than retention_days from scheduled_messages to scheduled_messages_archive. Returns the number of rows archived.';

-- Grant execute to service role (used by the cron job)
grant execute on function public.archive_old_scheduled_messages(integer)
  to service_role;

-- ── 3. pg_cron nightly job (requires pg_cron extension) ───────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove stale job if it exists with an old name
    perform cron.unschedule('archive-scheduled-messages')
      where exists (
        select 1 from cron.job where jobname = 'archive-scheduled-messages'
      );

    perform cron.schedule(
      'archive-scheduled-messages',
      '0 3 * * *',  -- 03:00 UTC daily
      $cmd$
        select public.archive_old_scheduled_messages(90);
      $cmd$
    );

    raise notice 'pg_cron job "archive-scheduled-messages" created (03:00 UTC daily, 90-day retention).';
  else
    raise notice 'pg_cron not available — run the archival RPC manually or via an external cron job.';
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end;
$$;

-- ── 4. Index for efficient archival query ─────────────────────────────────────

create index if not exists idx_scheduled_messages_archive_status_created
  on public.scheduled_messages_archive (status, created_at desc);
