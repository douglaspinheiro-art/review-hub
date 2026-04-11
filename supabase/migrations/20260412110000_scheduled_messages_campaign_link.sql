-- Priority 1: Scalable Message Queue Enhancements
-- Adds campaign_id to scheduled_messages for better manual campaign tracking in background
-- (skipped entirely if scheduled_messages does not exist — some remotes never ran v4 automations infra)

DO $m$
BEGIN
  IF to_regclass('public.scheduled_messages') IS NULL THEN
    RETURN;
  END IF;

  alter table public.scheduled_messages
    add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

  create index if not exists idx_scheduled_messages_campaign_id
    on public.scheduled_messages(campaign_id);

  create index if not exists idx_scheduled_messages_worker_lookup
    on public.scheduled_messages(status, scheduled_for)
    where status = 'pending';
END $m$;
