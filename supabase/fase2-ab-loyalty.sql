-- FASE 2 — A/B Testing, Loyalty Portal, Benchmarks
-- Run after fase1-attribution.sql

-- ─── 1. A/B Tests ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ab_tests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  variant_a_id      uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_b_id      uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  split_pct         int         NOT NULL DEFAULT 50,  -- % sent to variant A
  winner_metric     text        NOT NULL DEFAULT 'read_rate', -- read_rate | reply_rate
  decide_after_hours int        NOT NULL DEFAULT 4,
  winner_variant    text,        -- 'a' | 'b' | null while running
  decided_at        timestamptz,
  status            text        NOT NULL DEFAULT 'running', -- running | decided
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY ab_tests_own ON ab_tests USING (user_id = auth.uid());

-- Link campaigns to their A/B test
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS ab_test_id   uuid REFERENCES ab_tests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ab_variant   text;  -- 'a' | 'b'

-- ─── 2. Loyalty Portal ────────────────────────────────────────────────────────
-- Unique URL slug for each store's public loyalty portal
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS loyalty_slug text UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_loyalty_slug_idx
  ON profiles(loyalty_slug)
  WHERE loyalty_slug IS NOT NULL;

-- Customer points per store
CREATE TABLE IF NOT EXISTS loyalty_points (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id      uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  points          int         NOT NULL DEFAULT 0,
  tier            text        NOT NULL DEFAULT 'bronze',
  total_earned    int         NOT NULL DEFAULT 0,
  total_redeemed  int         NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_id)
);

ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
-- Store owners see their customers' points
CREATE POLICY loyalty_points_owner ON loyalty_points
  USING (user_id = auth.uid());
-- Public read by phone (used by portal — checked in RPC)
-- RPC resolve_loyalty_by_phone handles this securely

-- Points transaction history
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id   uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  points       int         NOT NULL,  -- positive = earned, negative = redeemed
  reason       text        NOT NULL,  -- purchase|review|birthday|referral|redemption
  reference_id text,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY loyalty_tx_owner ON loyalty_transactions
  USING (user_id = auth.uid());

-- ─── 3. Tier calculation helper ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_tier(p_total_earned int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_total_earned >= 5000 THEN 'diamond'
    WHEN p_total_earned >= 1500 THEN 'gold'
    WHEN p_total_earned >= 500  THEN 'silver'
    ELSE 'bronze'
  END
$$;

-- ─── 4. Add points (used by edge functions and RPC) ────────────────────────────
CREATE OR REPLACE FUNCTION add_loyalty_points(
  p_user_id    uuid,
  p_contact_id uuid,
  p_points     int,
  p_reason     text,
  p_reference  text DEFAULT NULL,
  p_desc       text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_total int;
BEGIN
  INSERT INTO loyalty_points (user_id, contact_id, points, total_earned, last_activity_at)
  VALUES (p_user_id, p_contact_id, GREATEST(p_points, 0), GREATEST(p_points, 0), now())
  ON CONFLICT (user_id, contact_id)
  DO UPDATE SET
    points         = loyalty_points.points + p_points,
    total_earned   = CASE WHEN p_points > 0
                       THEN loyalty_points.total_earned + p_points
                       ELSE loyalty_points.total_earned END,
    total_redeemed = CASE WHEN p_points < 0
                       THEN loyalty_points.total_redeemed + ABS(p_points)
                       ELSE loyalty_points.total_redeemed END,
    last_activity_at = now(),
    updated_at     = now();

  SELECT total_earned INTO v_new_total
  FROM loyalty_points
  WHERE user_id = p_user_id AND contact_id = p_contact_id;

  UPDATE loyalty_points
  SET tier = calculate_tier(v_new_total)
  WHERE user_id = p_user_id AND contact_id = p_contact_id;

  INSERT INTO loyalty_transactions
    (user_id, contact_id, points, reason, reference_id, description)
  VALUES (p_user_id, p_contact_id, p_points, p_reason, p_reference, p_desc);
END;
$$;

-- ─── 5. Public RPC for loyalty portal (no auth required) ──────────────────────
CREATE OR REPLACE FUNCTION resolve_loyalty_by_phone(
  p_slug  text,
  p_phone text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    uuid;
  v_contact_id uuid;
  v_lp         record;
  v_txs        jsonb;
  v_norm_phone text;
BEGIN
  -- Normalize phone
  v_norm_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF NOT v_norm_phone LIKE '55%' THEN
    v_norm_phone := '55' || v_norm_phone;
  END IF;

  -- Find store by slug
  SELECT id INTO v_user_id FROM profiles WHERE loyalty_slug = p_slug;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Loja não encontrada');
  END IF;

  -- Find contact
  SELECT id INTO v_contact_id FROM contacts
  WHERE user_id = v_user_id AND phone = v_norm_phone;
  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Número não cadastrado nessa loja');
  END IF;

  -- Get points record
  SELECT * INTO v_lp FROM loyalty_points
  WHERE user_id = v_user_id AND contact_id = v_contact_id;

  IF v_lp IS NULL THEN
    RETURN jsonb_build_object(
      'points', 0, 'tier', 'bronze', 'total_earned', 0, 'transactions', '[]'::jsonb
    );
  END IF;

  -- Last 10 transactions
  SELECT jsonb_agg(
    jsonb_build_object(
      'points', t.points,
      'reason', t.reason,
      'description', t.description,
      'created_at', t.created_at
    ) ORDER BY t.created_at DESC
  ) INTO v_txs
  FROM (
    SELECT * FROM loyalty_transactions
    WHERE user_id = v_user_id AND contact_id = v_contact_id
    ORDER BY created_at DESC LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'points',         v_lp.points,
    'tier',           v_lp.tier,
    'total_earned',   v_lp.total_earned,
    'total_redeemed', v_lp.total_redeemed,
    'transactions',   COALESCE(v_txs, '[]'::jsonb)
  );
END;
$$;

-- ─── 6. Benchmark reports ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benchmark_reports (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start  date  NOT NULL,
  metrics     jsonb NOT NULL DEFAULT '{}',
  benchmarks  jsonb NOT NULL DEFAULT '{}',
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE benchmark_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY benchmark_reports_own ON benchmark_reports
  USING (user_id = auth.uid());
