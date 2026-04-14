-- Migration: user_id NOT NULL guard
--
-- Purpose: Rows with NULL user_id are invisible to RLS (auth.uid() = user_id never matches)
-- but are NOT cleaned up automatically, accumulating as orphaned ghost data.
-- Adding NOT NULL prevents future orphan rows from being inserted.
--
-- Safety: Each ALTER is conditional — it only fires when NO NULLs exist in that column.
-- If NULLs are present (e.g. from legacy data), the constraint is silently skipped
-- and the DBA should backfill or delete those rows manually before re-running.
--
-- Backfill recipe (run manually if the DO block skips):
--   DELETE FROM contacts         WHERE user_id IS NULL;
--   DELETE FROM conversations    WHERE user_id IS NULL;
--   DELETE FROM messages         WHERE user_id IS NULL;
--   DELETE FROM analytics_daily  WHERE user_id IS NULL;
-- Then re-run: supabase db push --linked

DO $$
DECLARE
  _contacts_nulls        bigint;
  _conversations_nulls   bigint;
  _messages_nulls        bigint;
  _analytics_daily_nulls bigint;
BEGIN

  -- ── contacts ──────────────────────────────────────────────────────────────────
  IF to_regclass('public.contacts') IS NOT NULL THEN
    SELECT COUNT(*) INTO _contacts_nulls FROM public.contacts WHERE user_id IS NULL;
    IF _contacts_nulls = 0 THEN
      BEGIN
        ALTER TABLE public.contacts ALTER COLUMN user_id SET NOT NULL;
        RAISE NOTICE 'contacts.user_id SET NOT NULL (0 nulls found)';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'contacts.user_id NOT NULL already set or constraint exists: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'SKIPPED contacts.user_id NOT NULL — % null rows found. Backfill required.', _contacts_nulls;
    END IF;
  END IF;

  -- ── conversations ─────────────────────────────────────────────────────────────
  IF to_regclass('public.conversations') IS NOT NULL THEN
    SELECT COUNT(*) INTO _conversations_nulls FROM public.conversations WHERE user_id IS NULL;
    IF _conversations_nulls = 0 THEN
      BEGIN
        ALTER TABLE public.conversations ALTER COLUMN user_id SET NOT NULL;
        RAISE NOTICE 'conversations.user_id SET NOT NULL (0 nulls found)';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'conversations.user_id NOT NULL already set or constraint exists: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'SKIPPED conversations.user_id NOT NULL — % null rows found. Backfill required.', _conversations_nulls;
    END IF;
  END IF;

  -- ── messages ──────────────────────────────────────────────────────────────────
  IF to_regclass('public.messages') IS NOT NULL THEN
    SELECT COUNT(*) INTO _messages_nulls FROM public.messages WHERE user_id IS NULL;
    IF _messages_nulls = 0 THEN
      BEGIN
        ALTER TABLE public.messages ALTER COLUMN user_id SET NOT NULL;
        RAISE NOTICE 'messages.user_id SET NOT NULL (0 nulls found)';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'messages.user_id NOT NULL already set or constraint exists: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'SKIPPED messages.user_id NOT NULL — % null rows found. Backfill required.', _messages_nulls;
    END IF;
  END IF;

  -- ── analytics_daily ───────────────────────────────────────────────────────────
  IF to_regclass('public.analytics_daily') IS NOT NULL THEN
    SELECT COUNT(*) INTO _analytics_daily_nulls FROM public.analytics_daily WHERE user_id IS NULL;
    IF _analytics_daily_nulls = 0 THEN
      BEGIN
        ALTER TABLE public.analytics_daily ALTER COLUMN user_id SET NOT NULL;
        RAISE NOTICE 'analytics_daily.user_id SET NOT NULL (0 nulls found)';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'analytics_daily.user_id NOT NULL already set or constraint exists: %', SQLERRM;
      END;
    ELSE
      RAISE WARNING 'SKIPPED analytics_daily.user_id NOT NULL — % null rows found. Backfill required.', _analytics_daily_nulls;
    END IF;
  END IF;

END $$;
