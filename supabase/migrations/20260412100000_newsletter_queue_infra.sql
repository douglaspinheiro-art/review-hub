-- Priority 1: Asynchronous Message Queue for Newsletter
-- Refactors newsletter_send_recipients to act as a queue

alter table public.newsletter_send_recipients 
  add column if not exists status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  add column if not exists error_message text,
  add column if not exists attempts integer default 0,
  add column if not exists processed_at timestamptz;

-- Index for the background worker to find pending recipients efficiently
create index if not exists idx_newsletter_send_recipients_status_campaign 
  on public.newsletter_send_recipients(status, campaign_id) 
  where status = 'pending';

-- Add unique constraint for (campaign_id, customer_id) if not already present
-- The earlier migration 20260408120000 added it as a unique index, but let's ensure it's a constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'newsletter_send_recipients_campaign_customer_unq'
  ) then
    alter table public.newsletter_send_recipients 
      add constraint newsletter_send_recipients_campaign_customer_unq unique (campaign_id, customer_id);
  end if;
end $$;
