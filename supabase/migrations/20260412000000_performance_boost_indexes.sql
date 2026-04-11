-- Production Readiness: Performance Boost Indexes
-- Optimization for large datasets (100+ stores, millions of contacts/messages)

-- 1. Campaigns optimization
-- Used in list views and filtering by status
create index if not exists idx_campaigns_store_status_created on public.campaigns(store_id, status, created_at desc);

-- 2. Customers v3 optimization
-- Used in Newsletter recipient filtering and RFM Matrix
create index if not exists idx_customers_v3_tags_gin on public.customers_v3 using gin(tags);
create index if not exists idx_customers_v3_store_rfm on public.customers_v3(store_id, rfm_segment);
create index if not exists idx_customers_v3_store_email on public.customers_v3(store_id, email) where email is not null;
create index if not exists idx_customers_v3_store_phone on public.customers_v3(store_id, phone) where phone is not null;

-- 3. Contacts optimization (legacy/inbox compatibility)
create index if not exists idx_contacts_tags_gin on public.contacts using gin(tags);
create index if not exists idx_contacts_store_status on public.contacts(store_id, status);

-- 4. Message Sends optimization
-- Critical for campaign report performance (joins)
create index if not exists idx_message_sends_campaign_id on public.message_sends(campaign_id);

-- 5. Attribution Events optimization
-- Many queries filter by attributed_campaign_id to calculate ROI
create index if not exists idx_attribution_events_campaign_id on public.attribution_events(attributed_campaign_id) where attributed_campaign_id is not null;
create index if not exists idx_attribution_events_automation_id on public.attribution_events(attributed_automation_id) where attributed_automation_id is not null;

-- 6. Scheduled Messages optimization (table may be absent on DBs that skipped legacy migrations)
DO $perf_sched$
BEGIN
  IF to_regclass('public.scheduled_messages') IS NOT NULL THEN
    EXECUTE $idx$
      create index if not exists idx_scheduled_messages_store_status
      on public.scheduled_messages(store_id, status) where status = 'pending'
    $idx$;
    EXECUTE $idx$
      create index if not exists idx_scheduled_messages_journey_id
      on public.scheduled_messages(journey_id)
    $idx$;
  END IF;
END $perf_sched$;
