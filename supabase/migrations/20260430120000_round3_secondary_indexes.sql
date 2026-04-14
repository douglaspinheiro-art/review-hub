-- Migration: Round 3 secondary indexes
--
-- Purpose: Three composite indexes identified as missing in the Round 3 audit.
-- These cover the most common filter patterns at 100+ stores:
--   1. analytics_daily(store_id, date)       — dashboard KPI queries per store
--   2. conversations(store_id, status)       — Inbox filtering by store + status
--   3. customers_v3(store_id, created_at)    — paginated contact queries per store
--
-- All created with IF NOT EXISTS so this migration is safe to re-run.

-- 1. Analytics daily KPIs grouped by store + date
CREATE INDEX IF NOT EXISTS idx_analytics_daily_store_date
  ON public.analytics_daily (store_id, date)
  WHERE store_id IS NOT NULL;

-- 2. Inbox conversation listing by store + status (most common Inbox filter)
CREATE INDEX IF NOT EXISTS idx_conversations_store_status
  ON public.conversations (store_id, status)
  WHERE store_id IS NOT NULL;

-- 3. Paginated contact list ordered by signup date per store
CREATE INDEX IF NOT EXISTS idx_customers_v3_store_created
  ON public.customers_v3 (store_id, created_at DESC)
  WHERE store_id IS NOT NULL;
