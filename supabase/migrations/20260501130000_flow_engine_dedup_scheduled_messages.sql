-- 20260501130000_flow_engine_dedup_scheduled_messages.sql
--
-- Prevents duplicate scheduled_messages when flow-engine is invoked from
-- multiple code paths (process-scheduled-messages + trigger-automations)
-- for the same cart/journey combination.
--
-- Strategy: unique partial index on (store_id, customer_id, journey_id, status)
-- where status = 'pending'. When a message is already pending for the same
-- customer × journey, a second insert is rejected (ON CONFLICT DO NOTHING
-- in the caller is sufficient).
--
-- Note: this only deduplicates pending messages. Sent/failed rows are not
-- affected so historical data is preserved.

DO $$
BEGIN
  IF to_regclass('public.scheduled_messages') IS NOT NULL THEN
    -- Unique index: one pending message per (store, customer, journey) at a time.
    -- Allows re-scheduling after failure (status changes from pending → failed).
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_messages_pending_dedup
        ON public.scheduled_messages (store_id, customer_id, journey_id)
        WHERE status = 'pending'
          AND journey_id IS NOT NULL
    $idx$;
  END IF;
END $$;
