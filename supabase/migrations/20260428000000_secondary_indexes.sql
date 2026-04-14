-- Secondary indexes identified in Round 2 audit
-- Safe to run multiple times (IF NOT EXISTS)

-- 1. analytics_daily: store-scoped date range queries (dashboard KPI cards per store)
CREATE INDEX IF NOT EXISTS idx_analytics_daily_store_date
  ON analytics_daily (store_id, date DESC);

-- 2. conversations: inbox list filtered by store + status (most common Inbox query pattern)
CREATE INDEX IF NOT EXISTS idx_conversations_store_status
  ON conversations (store_id, status)
  WHERE store_id IS NOT NULL;

-- 3. customers_v3: store-scoped paginated contact list (Contatos.tsx pagination)
CREATE INDEX IF NOT EXISTS idx_customers_v3_store_created
  ON customers_v3 (store_id, created_at DESC)
  WHERE store_id IS NOT NULL;
