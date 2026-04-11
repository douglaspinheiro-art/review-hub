-- Priority 1: Scalable Message Queue Enhancements
-- Adds campaign_id to scheduled_messages for better manual campaign tracking in background

alter table public.scheduled_messages 
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;

create index if not exists idx_scheduled_messages_campaign_id 
  on public.scheduled_messages(campaign_id);

-- Ensure all necessary indexes for worker performance
create index if not exists idx_scheduled_messages_worker_lookup 
  on public.scheduled_messages(status, scheduled_for) 
  where status = 'pending';
