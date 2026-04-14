-- ============================================================
-- Production Readiness Fixes — 2026-04-26
-- Addresses: idempotency tables, missing indexes, cascade deletes
-- ============================================================

-- ── 1. Resend webhook deduplication ─────────────────────────
CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    text UNIQUE NOT NULL,
  type        text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-purge after 30 days to prevent unbounded growth
CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_processed
  ON public.resend_webhook_events (processed_at);

-- RLS: service role only (no user access needed)
ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role can write

-- ── 2. WhatsApp inbound message idempotency ──────────────────
-- Add UNIQUE on external_id so upsert ignoreDuplicates works.
-- external_id can be NULL for internally generated messages, so partial index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id_unique
  ON public.messages (external_id)
  WHERE external_id IS NOT NULL;

-- ── 3. Missing indexes on hot query paths ────────────────────
CREATE INDEX IF NOT EXISTS idx_message_sends_customer_id
  ON public.message_sends (customer_id);

CREATE INDEX IF NOT EXISTS idx_messages_conv_sent
  ON public.messages (conversation_id, sent_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_store_status
  ON public.abandoned_carts (store_id, status);

CREATE INDEX IF NOT EXISTS idx_customers_v3_store_rfm
  ON public.customers_v3 (store_id, rfm_segment);

CREATE INDEX IF NOT EXISTS idx_customers_v3_store_phone
  ON public.customers_v3 (store_id, phone);

-- Attribution events: used in ROI bundle aggregation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attribution_events'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_attribution_events_campaign
        ON public.attribution_events (attributed_campaign_id)
        WHERE attributed_campaign_id IS NOT NULL
    $sql$;
  END IF;
END$$;

-- ── 4. ON DELETE CASCADE for orphan prevention ───────────────
-- These use DO blocks to be idempotent (won't fail if constraint already exists).

DO $$
BEGIN
  -- abandoned_carts.store_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'abandoned_carts'
      AND kcu.column_name = 'store_id'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE public.abandoned_carts
      DROP CONSTRAINT IF EXISTS abandoned_carts_store_id_fkey;
    ALTER TABLE public.abandoned_carts
      ADD CONSTRAINT abandoned_carts_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  -- customers_v3.store_id (if column + constraint exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers_v3' AND column_name = 'store_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'customers_v3'
      AND kcu.column_name = 'store_id'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE public.customers_v3
      DROP CONSTRAINT IF EXISTS customers_v3_store_id_fkey;
    ALTER TABLE public.customers_v3
      ADD CONSTRAINT customers_v3_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  -- scheduled_messages.store_id (if table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scheduled_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'scheduled_messages'
      AND kcu.column_name = 'store_id'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE public.scheduled_messages
      DROP CONSTRAINT IF EXISTS scheduled_messages_store_id_fkey;
    ALTER TABLE public.scheduled_messages
      ADD CONSTRAINT scheduled_messages_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
END$$;
