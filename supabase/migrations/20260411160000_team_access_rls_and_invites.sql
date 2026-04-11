-- Team access: invite tokens, hardened team_members RLS, tenant helpers, store/campaign RLS for collaborators.

-- ── 1. team_members: invite token + expiry ─────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS invite_token uuid,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_invite_token_uidx
  ON public.team_members (invite_token)
  WHERE invite_token IS NOT NULL;

-- ── 2. SECURITY DEFINER helpers (avoid RLS recursion; stable auth.uid()) ─────
CREATE OR REPLACE FUNCTION public.auth_team_read_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_store_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.stores s
    INNER JOIN public.team_members tm ON tm.account_owner_id = s.user_id
    WHERE s.id = p_store_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_team_write_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_store_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.stores s
    INNER JOIN public.team_members tm ON tm.account_owner_id = s.user_id
    WHERE s.id = p_store_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'active'
      AND tm.role IN ('admin', 'operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_team_read_owner(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.account_owner_id = p_owner_user_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_team_write_owner(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.account_owner_id = p_owner_user_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'active'
      AND tm.role IN ('admin', 'operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_team_admin_owner(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.account_owner_id = p_owner_user_id
      AND tm.invited_user_id = (SELECT auth.uid())
      AND tm.status = 'active'
      AND tm.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.auth_team_read_store(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_team_write_store(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_team_read_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_team_write_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_team_admin_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_read_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_team_write_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_team_read_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_team_write_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_team_admin_owner(uuid) TO authenticated;

-- Row helpers: owner OR team read / write on (user_id, store_id) tenant rows
CREATE OR REPLACE FUNCTION public.auth_row_read_user_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id = (SELECT auth.uid())
    OR (p_store_id IS NOT NULL AND public.auth_team_read_store(p_store_id))
    OR (p_store_id IS NULL AND public.auth_team_read_owner(p_user_id));
$$;

CREATE OR REPLACE FUNCTION public.auth_row_write_user_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id = (SELECT auth.uid())
    OR (p_store_id IS NOT NULL AND public.auth_team_write_store(p_store_id))
    OR (p_store_id IS NULL AND public.auth_team_write_owner(p_user_id));
$$;

REVOKE ALL ON FUNCTION public.auth_row_read_user_store(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_row_write_user_store(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_row_read_user_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_row_write_user_store(uuid, uuid) TO authenticated;

-- ── 3. team_members RLS (owner full; invitee SELECT only when active) ──────
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_own ON public.team_members;
DROP POLICY IF EXISTS team_members_owner_all ON public.team_members;
DROP POLICY IF EXISTS team_members_invitee_select ON public.team_members;

CREATE POLICY team_members_owner_all ON public.team_members
  FOR ALL TO authenticated
  USING (account_owner_id = (SELECT auth.uid()))
  WITH CHECK (account_owner_id = (SELECT auth.uid()));

CREATE POLICY team_members_invitee_select ON public.team_members
  FOR SELECT TO authenticated
  USING (
    invited_user_id = (SELECT auth.uid())
    AND status = 'active'
  );

-- ── 4. stores: collaborators can read owner store only ────────────────────────
DROP POLICY IF EXISTS stores_own ON public.stores;
DROP POLICY IF EXISTS "Users can view own stores" ON public.stores;
DROP POLICY IF EXISTS stores_select_tenant ON public.stores;
DROP POLICY IF EXISTS stores_insert_owner ON public.stores;
DROP POLICY IF EXISTS stores_update_owner ON public.stores;
DROP POLICY IF EXISTS stores_delete_owner ON public.stores;

CREATE POLICY stores_select_tenant ON public.stores
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_team_read_store(id)
  );

CREATE POLICY stores_insert_owner ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY stores_update_owner ON public.stores
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY stores_delete_owner ON public.stores
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── 5. Core tenant tables (campaigns, contacts, …) ──────────────────────────
DROP POLICY IF EXISTS campaigns_own ON public.campaigns;
CREATE POLICY campaigns_own ON public.campaigns
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS contacts_own ON public.contacts;
CREATE POLICY contacts_own ON public.contacts
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS conversations_own ON public.conversations;
CREATE POLICY conversations_own ON public.conversations
  FOR ALL TO authenticated
  USING (
    contact_id IN (
      SELECT ct.id FROM public.contacts ct
      WHERE public.auth_row_read_user_store(ct.user_id, ct.store_id)
    )
  )
  WITH CHECK (
    contact_id IN (
      SELECT ct.id FROM public.contacts ct
      WHERE public.auth_row_write_user_store(ct.user_id, ct.store_id)
    )
  );

DROP POLICY IF EXISTS messages_own ON public.messages;
CREATE POLICY messages_own ON public.messages
  FOR ALL TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.contacts ct ON c.contact_id = ct.id
      WHERE public.auth_row_read_user_store(ct.user_id, ct.store_id)
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.contacts ct ON c.contact_id = ct.id
      WHERE public.auth_row_write_user_store(ct.user_id, ct.store_id)
    )
  );

DROP POLICY IF EXISTS segments_own ON public.campaign_segments;
CREATE POLICY segments_own ON public.campaign_segments
  FOR ALL TO authenticated
  USING (
    campaign_id IN (
      SELECT c.id FROM public.campaigns c
      WHERE public.auth_row_read_user_store(c.user_id, c.store_id)
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT c.id FROM public.campaigns c
      WHERE public.auth_row_write_user_store(c.user_id, c.store_id)
    )
  );

DROP POLICY IF EXISTS abandoned_carts_own ON public.abandoned_carts;
CREATE POLICY abandoned_carts_own ON public.abandoned_carts
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS analytics_own ON public.analytics_daily;
DROP POLICY IF EXISTS analytics_daily_own ON public.analytics_daily;
CREATE POLICY analytics_daily_tenant ON public.analytics_daily
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS customers_v3_own ON public.customers_v3;
CREATE POLICY customers_v3_own ON public.customers_v3
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS opportunities_own ON public.opportunities;
CREATE POLICY opportunities_own ON public.opportunities
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS diagnostics_v3_own ON public.diagnostics_v3;
CREATE POLICY diagnostics_v3_own ON public.diagnostics_v3
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_team_read_owner(user_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.auth_team_write_owner(user_id)
  );

DROP POLICY IF EXISTS whatsapp_own ON public.whatsapp_connections;
DROP POLICY IF EXISTS "Users can view own wa_connections" ON public.whatsapp_connections;
CREATE POLICY whatsapp_connections_tenant ON public.whatsapp_connections
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DROP POLICY IF EXISTS message_sends_own ON public.message_sends;
DROP POLICY IF EXISTS "Users own message_sends" ON public.message_sends;
CREATE POLICY message_sends_tenant ON public.message_sends
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

DO $$
BEGIN
  IF to_regclass('public.attribution_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS attribution_own ON public.attribution_events;
    DROP POLICY IF EXISTS attribution_events_tenant ON public.attribution_events;
    CREATE POLICY attribution_events_tenant ON public.attribution_events
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_read_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_write_owner(user_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ab_tests') IS NOT NULL THEN
    DROP POLICY IF EXISTS ab_tests_own ON public.ab_tests;
    DROP POLICY IF EXISTS ab_tests_tenant ON public.ab_tests;
    CREATE POLICY ab_tests_tenant ON public.ab_tests
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_read_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_write_owner(user_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.automations') IS NOT NULL THEN
    DROP POLICY IF EXISTS automations_own ON public.automations;
    DROP POLICY IF EXISTS automations_tenant ON public.automations;
    CREATE POLICY automations_tenant ON public.automations
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_admin_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_admin_owner(user_id)
      );
  END IF;
END $$;

DROP POLICY IF EXISTS inbox_routing_settings_own ON public.inbox_routing_settings;
CREATE POLICY inbox_routing_settings_tenant ON public.inbox_routing_settings
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_team_write_owner(user_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.auth_team_write_owner(user_id)
  );

DO $$
BEGIN
  IF to_regclass('public.conversation_notes') IS NOT NULL THEN
    DROP POLICY IF EXISTS conversation_notes_own ON public.conversation_notes;
    DROP POLICY IF EXISTS conversation_notes_tenant ON public.conversation_notes;
    CREATE POLICY conversation_notes_tenant ON public.conversation_notes
      FOR ALL TO authenticated
      USING (
        conversation_id IN (
          SELECT c.id
          FROM public.conversations c
          JOIN public.contacts ct ON c.contact_id = ct.id
          WHERE public.auth_row_read_user_store(ct.user_id, ct.store_id)
        )
      )
      WITH CHECK (
        conversation_id IN (
          SELECT c.id
          FROM public.conversations c
          JOIN public.contacts ct ON c.contact_id = ct.id
          WHERE public.auth_row_write_user_store(ct.user_id, ct.store_id)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.forecast_snapshots') IS NOT NULL THEN
    DROP POLICY IF EXISTS forecast_snapshots_own ON public.forecast_snapshots;
    DROP POLICY IF EXISTS forecast_snapshots_tenant ON public.forecast_snapshots;
    CREATE POLICY forecast_snapshots_tenant ON public.forecast_snapshots
      FOR ALL TO authenticated
      USING (
        store_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM public.stores s WHERE s.id = forecast_snapshots.store_id AND s.user_id = (SELECT auth.uid()))
          OR public.auth_team_read_store(forecast_snapshots.store_id)
        )
      )
      WITH CHECK (
        store_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM public.stores s WHERE s.id = forecast_snapshots.store_id AND s.user_id = (SELECT auth.uid()))
          OR public.auth_team_write_store(forecast_snapshots.store_id)
        )
      );
  END IF;
END $$;

-- Operational / blueprint tables (store_id + user_id)
DO $$
BEGIN
  IF to_regclass('public.funil_diario') IS NOT NULL THEN
    DROP POLICY IF EXISTS funil_diario_own ON public.funil_diario;
    DROP POLICY IF EXISTS funil_diario_tenant ON public.funil_diario;
    CREATE POLICY funil_diario_tenant ON public.funil_diario
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.data_quality_snapshots') IS NOT NULL THEN
    DROP POLICY IF EXISTS data_quality_snapshots_own ON public.data_quality_snapshots;
    DROP POLICY IF EXISTS data_quality_snapshots_tenant ON public.data_quality_snapshots;
    CREATE POLICY data_quality_snapshots_tenant ON public.data_quality_snapshots
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.catalog_snapshot') IS NOT NULL THEN
    DROP POLICY IF EXISTS catalog_snapshot_own ON public.catalog_snapshot;
    DROP POLICY IF EXISTS catalog_snapshot_tenant ON public.catalog_snapshot;
    CREATE POLICY catalog_snapshot_tenant ON public.catalog_snapshot
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.order_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS order_events_own ON public.order_events;
    DROP POLICY IF EXISTS order_events_tenant ON public.order_events;
    CREATE POLICY order_events_tenant ON public.order_events
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.shipping_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS shipping_events_own ON public.shipping_events;
    DROP POLICY IF EXISTS shipping_events_tenant ON public.shipping_events;
    CREATE POLICY shipping_events_tenant ON public.shipping_events
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.customer_cohorts') IS NOT NULL THEN
    DROP POLICY IF EXISTS customer_cohorts_own ON public.customer_cohorts;
    DROP POLICY IF EXISTS customer_cohorts_tenant ON public.customer_cohorts;
    CREATE POLICY customer_cohorts_tenant ON public.customer_cohorts
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

-- Newsletter: recipients / engagement are user_id-only; saved_blocks may have store_id
DO $$
BEGIN
  IF to_regclass('public.newsletter_send_recipients') IS NOT NULL THEN
    DROP POLICY IF EXISTS newsletter_send_recipients_own ON public.newsletter_send_recipients;
    DROP POLICY IF EXISTS newsletter_send_recipients_tenant ON public.newsletter_send_recipients;
    CREATE POLICY newsletter_send_recipients_tenant ON public.newsletter_send_recipients
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_read_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_write_owner(user_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.email_engagement_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS email_engagement_events_own ON public.email_engagement_events;
    DROP POLICY IF EXISTS email_engagement_events_tenant ON public.email_engagement_events;
    CREATE POLICY email_engagement_events_tenant ON public.email_engagement_events
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_read_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_write_owner(user_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.newsletter_saved_blocks') IS NOT NULL THEN
    DROP POLICY IF EXISTS newsletter_saved_blocks_own ON public.newsletter_saved_blocks;
    DROP POLICY IF EXISTS newsletter_saved_blocks_tenant ON public.newsletter_saved_blocks;
    CREATE POLICY newsletter_saved_blocks_tenant ON public.newsletter_saved_blocks
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.campaign_message_templates') IS NOT NULL THEN
    DROP POLICY IF EXISTS campaign_message_templates_own ON public.campaign_message_templates;
    DROP POLICY IF EXISTS campaign_message_templates_tenant ON public.campaign_message_templates;
    CREATE POLICY campaign_message_templates_tenant ON public.campaign_message_templates
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.integrations') IS NOT NULL THEN
    DROP POLICY IF EXISTS integrations_own ON public.integrations;
    DROP POLICY IF EXISTS integrations_tenant ON public.integrations;
    CREATE POLICY integrations_tenant ON public.integrations
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    DROP POLICY IF EXISTS reviews_own ON public.reviews;
    DROP POLICY IF EXISTS reviews_tenant ON public.reviews;
    CREATE POLICY reviews_tenant ON public.reviews
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_read_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_write_owner(user_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.review_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS review_requests_own ON public.review_requests;
    DROP POLICY IF EXISTS review_requests_tenant ON public.review_requests;
    CREATE POLICY review_requests_tenant ON public.review_requests
      FOR ALL TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.auth_team_read_owner(user_id)
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        OR public.auth_team_write_owner(user_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.scheduled_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users own scheduled_messages" ON public.scheduled_messages;
    DROP POLICY IF EXISTS scheduled_messages_own ON public.scheduled_messages;
    DROP POLICY IF EXISTS scheduled_messages_tenant ON public.scheduled_messages;
    CREATE POLICY scheduled_messages_tenant ON public.scheduled_messages
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users own orders" ON public.orders;
    DROP POLICY IF EXISTS orders_own ON public.orders;
    DROP POLICY IF EXISTS orders_tenant ON public.orders;
    CREATE POLICY orders_tenant ON public.orders
      FOR ALL TO authenticated
      USING (public.auth_row_read_user_store(user_id, store_id))
      WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
  END IF;
END $$;

-- Message search RPC: include conversations visible to team collaborators
CREATE OR REPLACE FUNCTION public.search_conversation_ids_by_message(p_search text)
RETURNS TABLE (conversation_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT m.conversation_id
  FROM public.messages m
  INNER JOIN public.conversations c ON c.id = m.conversation_id
  INNER JOIN public.contacts ct ON c.contact_id = ct.id
  WHERE public.auth_row_read_user_store(ct.user_id, ct.store_id)
    AND length(trim(coalesce(p_search, ''))) >= 2
    AND position(lower(trim(p_search)) IN lower(m.content)) > 0
  LIMIT 400;
$$;
