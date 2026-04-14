-- Round 4: Add NOT NULL constraints to tenant isolation columns.
-- A hydration race during StoreScopeContext initialization could previously write
-- NULL store_id into these tables, making rows orphaned and RLS-invisible.
--
-- Steps:
-- 1. Backfill any existing NULLs from user_id → stores join.
-- 2. Apply NOT NULL constraint.
--
-- Run after verifying no legitimate NULL rows exist (e.g., check SELECT count(*) WHERE store_id IS NULL).

-- ── campaigns ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Backfill: set store_id from the user's primary store where NULL
  UPDATE campaigns c
  SET store_id = (
    SELECT s.id FROM stores s
    WHERE s.user_id = c.user_id
    ORDER BY s.created_at ASC
    LIMIT 1
  )
  WHERE c.store_id IS NULL AND c.user_id IS NOT NULL;

  -- Drop rows that still have NULL store_id after backfill (no recoverable store)
  DELETE FROM campaigns WHERE store_id IS NULL;

  -- Apply constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'store_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE campaigns ALTER COLUMN store_id SET NOT NULL;
  END IF;
END $$;

-- ── message_sends ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  UPDATE message_sends ms
  SET store_id = (
    SELECT s.id FROM stores s
    WHERE s.user_id = ms.user_id
    ORDER BY s.created_at ASC
    LIMIT 1
  )
  WHERE ms.store_id IS NULL AND ms.user_id IS NOT NULL;

  DELETE FROM message_sends WHERE store_id IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_sends' AND column_name = 'store_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE message_sends ALTER COLUMN store_id SET NOT NULL;
  END IF;
END $$;

-- ── scheduled_messages ─────────────────────────────────────────────────────────
DO $$
BEGIN
  UPDATE scheduled_messages sm
  SET store_id = (
    SELECT s.id FROM stores s
    WHERE s.user_id = sm.user_id
    ORDER BY s.created_at ASC
    LIMIT 1
  )
  WHERE sm.store_id IS NULL AND sm.user_id IS NOT NULL;

  DELETE FROM scheduled_messages WHERE store_id IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_messages' AND column_name = 'store_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE scheduled_messages ALTER COLUMN store_id SET NOT NULL;
  END IF;
END $$;
