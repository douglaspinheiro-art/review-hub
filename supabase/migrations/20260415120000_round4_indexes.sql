-- Round 4: Three composite indexes for scalability at 100 stores.
-- These eliminate full-table scans on hot query paths.

-- campaign status aggregation (used by analytics and campaign list views)
CREATE INDEX IF NOT EXISTS idx_message_sends_campaign_status
  ON message_sends(campaign_id, status);

-- cron worker: find pending/processing messages per store, ordered by scheduled_for
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_store_sched
  ON scheduled_messages(store_id, scheduled_for, status)
  WHERE status IN ('pending', 'processing');

-- webhook history page: latest events per store
CREATE INDEX IF NOT EXISTS idx_webhook_logs_store_created
  ON webhook_logs(store_id, created_at DESC);
