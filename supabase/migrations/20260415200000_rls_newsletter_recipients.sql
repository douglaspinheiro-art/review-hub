-- Round 5: Fix cross-tenant RLS on newsletter_send_recipients and email_engagement_events.
-- Previous policies checked user_id directly on newsletter_campaigns, which allowed any
-- authenticated user whose uid matched a user_id elsewhere to bypass tenant isolation.
-- New policies traverse campaign_id → newsletter_campaigns.store_id → stores.user_id.
-- Wrapped in DO block: skips gracefully if newsletter_campaigns table does not exist yet.

DO $$
BEGIN

-- ── newsletter_send_recipients ──────────────────────────────────────────────
IF EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'newsletter_campaigns'
) THEN

  DROP POLICY IF EXISTS "newsletter_send_recipients_user" ON newsletter_send_recipients;
  DROP POLICY IF EXISTS "newsletter_send_recipients_select" ON newsletter_send_recipients;
  DROP POLICY IF EXISTS "newsletter_send_recipients_all" ON newsletter_send_recipients;
  DROP POLICY IF EXISTS "newsletter_send_recipients_store_owner" ON newsletter_send_recipients;

  CREATE POLICY "newsletter_send_recipients_store_owner"
    ON newsletter_send_recipients FOR ALL
    USING (
      campaign_id IN (
        SELECT nc.id
        FROM newsletter_campaigns nc
        JOIN stores s ON s.id = nc.store_id
        WHERE s.user_id = auth.uid()
           OR auth_team_read_store(nc.store_id)
      )
    )
    WITH CHECK (
      campaign_id IN (
        SELECT nc.id
        FROM newsletter_campaigns nc
        JOIN stores s ON s.id = nc.store_id
        WHERE s.user_id = auth.uid()
      )
    );

-- ── email_engagement_events ─────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_engagement_events'
  ) THEN
    DROP POLICY IF EXISTS "email_engagement_events_user" ON email_engagement_events;
    DROP POLICY IF EXISTS "email_engagement_events_select" ON email_engagement_events;
    DROP POLICY IF EXISTS "email_engagement_events_all" ON email_engagement_events;
    DROP POLICY IF EXISTS "email_engagement_events_store_owner" ON email_engagement_events;

    CREATE POLICY "email_engagement_events_store_owner"
      ON email_engagement_events FOR ALL
      USING (
        campaign_id IN (
          SELECT nc.id
          FROM newsletter_campaigns nc
          JOIN stores s ON s.id = nc.store_id
          WHERE s.user_id = auth.uid()
             OR auth_team_read_store(nc.store_id)
        )
      )
      WITH CHECK (
        campaign_id IN (
          SELECT nc.id
          FROM newsletter_campaigns nc
          JOIN stores s ON s.id = nc.store_id
          WHERE s.user_id = auth.uid()
        )
      );
  END IF;

ELSE
  RAISE NOTICE 'newsletter_campaigns table not found — skipping RLS policy update (run again after table is created)';
END IF;

END $$;
