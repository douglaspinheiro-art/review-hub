-- ============================================================
-- Scalability: Missing Indexes + Constraints — 2026-04-27
-- Addresses critical DB saturation risks identified in audit.
-- All statements are idempotent (IF NOT EXISTS / DO blocks).
-- ============================================================

-- ── scheduled_messages ──────────────────────────────────────
-- Main cron query: WHERE store_id = ? AND status = 'pending' ORDER BY scheduled_for
-- Without this, every cron run full-scans the table — instant saturation at 100 stores.
DO $$ BEGIN
  IF to_regclass('public.scheduled_messages') IS NOT NULL THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_store_status_sched
        ON public.scheduled_messages (store_id, status, scheduled_for)
        WHERE status = 'pending'
    $idx$;
    -- RLS filter path
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_store
        ON public.scheduled_messages (user_id, store_id)
    $idx$;
  END IF;
END $$;

-- ── customers_v3 ─────────────────────────────────────────────
-- RLS filter: user_id + store_id used in most tenant queries
CREATE INDEX IF NOT EXISTS idx_customers_v3_user_store
  ON public.customers_v3 (user_id, store_id);

-- resend-webhook email bounce suppression
CREATE INDEX IF NOT EXISTS idx_customers_v3_store_bounce
  ON public.customers_v3 (store_id, email_hard_bounce_at)
  WHERE email_hard_bounce_at IS NOT NULL;

-- ── conversations ─────────────────────────────────────────────
-- RLS join: messages → conversations → contacts (contact_id lookup)
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id
  ON public.conversations (contact_id)
  WHERE contact_id IS NOT NULL;

-- ── newsletter_send_recipients ────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.newsletter_send_recipients') IS NOT NULL THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_newsletter_send_recipients_campaign_status
        ON public.newsletter_send_recipients (campaign_id, status)
    $idx$;
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_newsletter_send_recipients_user_status
        ON public.newsletter_send_recipients (user_id, status)
    $idx$;
  END IF;
END $$;

-- ── webhook_queue ────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.webhook_queue') IS NOT NULL THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_webhook_queue_store_status_created
        ON public.webhook_queue (store_id, status, created_at)
        WHERE status IN ('pending', 'processing')
    $idx$;
  END IF;
END $$;

-- ── whatsapp_connections ─────────────────────────────────────
-- dispatch-campaign + meta-whatsapp-send lookup: store + status + provider
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_store_status_provider
  ON public.whatsapp_connections (store_id, status, provider);

-- ── Unique constraint: one Meta phone number per store ────────
-- Prevents two connections claiming the same WhatsApp number in a store.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'whatsapp_connections'
      AND constraint_name = 'uq_whatsapp_connections_store_meta_phone'
      AND constraint_type = 'UNIQUE'
  ) THEN
    -- Only enforce when meta_phone_number_id is set (Meta Cloud connections).
    CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_connections_store_meta_phone
      ON public.whatsapp_connections (store_id, meta_phone_number_id)
      WHERE meta_phone_number_id IS NOT NULL;
  END IF;
END $$;

-- ── Unique constraint: one phone per store in customers_v3 ────
-- Prevents duplicate customer records from webhook replays.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'customers_v3'
      AND indexname = 'uq_customers_v3_store_phone'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_v3_store_phone
      ON public.customers_v3 (store_id, phone)
      WHERE phone IS NOT NULL AND phone <> '';
  END IF;
END $$;

-- ── ON DELETE CASCADE: messages ──────────────────────────────
-- Orphan messages when a conversation is deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'messages'
      AND kcu.column_name = 'conversation_id'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE public.messages
      DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── ON DELETE CASCADE: conversations → contacts ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'contact_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'conversations'
      AND kcu.column_name = 'contact_id'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE public.conversations
      DROP CONSTRAINT IF EXISTS conversations_contact_id_fkey;
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── ON DELETE CASCADE: newsletter_send_recipients → campaigns ─
DO $$
BEGIN
  IF to_regclass('public.newsletter_send_recipients') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'newsletter_send_recipients' AND column_name = 'campaign_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = 'newsletter_send_recipients'
      AND kcu.column_name = 'campaign_id'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE public.newsletter_send_recipients
      DROP CONSTRAINT IF EXISTS newsletter_send_recipients_campaign_id_fkey;
    ALTER TABLE public.newsletter_send_recipients
      ADD CONSTRAINT newsletter_send_recipients_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;
  END IF;
END $$;
