-- FASE 1 — Attribution & Sending Infrastructure
-- Run in Supabase SQL Editor after phase1-migration.sql

-- ─── 1. External message tracking (Evolution API message IDs) ────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_id   text,
  ADD COLUMN IF NOT EXISTS external_data jsonb;

CREATE INDEX IF NOT EXISTS messages_external_id_idx
  ON messages (external_id)
  WHERE external_id IS NOT NULL;

-- ─── 2. Revenue attribution on campaigns ─────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS attribution_window_days int NOT NULL DEFAULT 7;

-- ─── 3. Link abandoned carts to the automation/campaign that sent the message ─
ALTER TABLE abandoned_carts
  ADD COLUMN IF NOT EXISTS automation_id uuid REFERENCES automations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id   uuid REFERENCES campaigns(id)   ON DELETE SET NULL;

-- ─── 4. Attribution events table ─────────────────────────────────────────────
-- Records every "order completed" event received from e-commerce webhooks.
-- Used to calculate revenue_influenced with the configured attribution window.
CREATE TABLE IF NOT EXISTS attribution_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id         text NOT NULL,                        -- external order ID
  customer_phone   text NOT NULL,                        -- normalized 55XXXXXXXXXX
  order_value      numeric(12,2) NOT NULL DEFAULT 0,
  source_platform  text,                                 -- shopify|nuvemshop|etc
  -- Which message originated the attribution (last-touch within window)
  attributed_message_id   uuid REFERENCES messages(id)   ON DELETE SET NULL,
  attributed_campaign_id  uuid REFERENCES campaigns(id)  ON DELETE SET NULL,
  attributed_automation_id uuid REFERENCES automations(id) ON DELETE SET NULL,
  cart_id          uuid REFERENCES abandoned_carts(id)   ON DELETE SET NULL,
  order_date       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id, source_platform)
);

ALTER TABLE attribution_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY attribution_own ON attribution_events
  USING (user_id = auth.uid());

-- ─── 5. Message send log — tracks which contact received which campaign msg ───
CREATE TABLE IF NOT EXISTS message_sends (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id    uuid REFERENCES campaigns(id)   ON DELETE SET NULL,
  automation_id  uuid REFERENCES automations(id) ON DELETE SET NULL,
  contact_id     uuid REFERENCES contacts(id)    ON DELETE CASCADE,
  message_id     uuid REFERENCES messages(id)    ON DELETE SET NULL,
  phone          text NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'sent'    -- sent|delivered|read|failed
);

ALTER TABLE message_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_sends_own ON message_sends
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS message_sends_campaign_idx   ON message_sends(campaign_id);
CREATE INDEX IF NOT EXISTS message_sends_contact_idx    ON message_sends(contact_id);
CREATE INDEX IF NOT EXISTS message_sends_phone_sent_idx ON message_sends(phone, sent_at DESC);

-- ─── 6. Helper function: upsert daily analytics ──────────────────────────────
CREATE OR REPLACE FUNCTION increment_daily_revenue(
  p_date date,
  p_amount numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO analytics_daily (date, revenue_influenced)
  VALUES (p_date, p_amount)
  ON CONFLICT (date)
  DO UPDATE SET revenue_influenced = analytics_daily.revenue_influenced + EXCLUDED.revenue_influenced;
END;
$$;
