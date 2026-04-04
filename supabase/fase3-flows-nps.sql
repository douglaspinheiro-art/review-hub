-- FASE 3 — Flows, NPS, AI Reply
-- Run after fase2-ab-loyalty.sql

-- ─── 1. Conversation Flows ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_flows (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  description   text,
  trigger_type  text        NOT NULL DEFAULT 'keyword',
  -- keyword | first_message | post_purchase | cart_abandoned | manual
  trigger_value text,       -- keyword text (for 'keyword' trigger)
  is_active     boolean     NOT NULL DEFAULT false,
  sessions_count   int      NOT NULL DEFAULT 0,
  completions_count int     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversation_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY flows_own ON conversation_flows USING (user_id = auth.uid());

-- Steps within a flow (executed sequentially)
CREATE TABLE IF NOT EXISTS flow_steps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     uuid        NOT NULL REFERENCES conversation_flows(id) ON DELETE CASCADE,
  step_order  int         NOT NULL,
  type        text        NOT NULL,
  -- send_text | send_buttons | wait_reply | branch | delay | tag_contact | send_nps
  config      jsonb       NOT NULL DEFAULT '{}',
  -- send_text:    { "text": "Olá {{nome}}!" }
  -- send_buttons: { "text": "Escolha:", "buttons": ["Sim", "Não", "Saber mais"] }
  -- wait_reply:   { "timeout_hours": 24 }
  -- branch:       { "conditions": [{"contains":"sim","next":3},{"default":true,"next":4}] }
  -- delay:        { "hours": 2 }
  -- tag_contact:  { "tag": "interessado" }
  -- send_nps:     { "question": "De 0 a 10, quanto você recomendaria nossa loja?" }
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, step_order)
);

ALTER TABLE flow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_steps_own ON flow_steps
  USING (flow_id IN (SELECT id FROM conversation_flows WHERE user_id = auth.uid()));

-- Active flow sessions (one per contact per flow while running)
CREATE TABLE IF NOT EXISTS flow_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id           uuid        NOT NULL REFERENCES conversation_flows(id) ON DELETE CASCADE,
  contact_id        uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_step_order int        NOT NULL DEFAULT 1,
  status            text        NOT NULL DEFAULT 'active',
  -- active | waiting_reply | completed | abandoned | error
  variables         jsonb       NOT NULL DEFAULT '{}',
  last_reply        text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

ALTER TABLE flow_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_sessions_own ON flow_sessions USING (user_id = auth.uid());

-- Index for fast lookup of active sessions by contact
CREATE INDEX IF NOT EXISTS flow_sessions_contact_active_idx
  ON flow_sessions (user_id, contact_id)
  WHERE status IN ('active', 'waiting_reply');

-- ─── 2. NPS responses ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nps_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id   uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  score        int         CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  comment      text,
  category     text GENERATED ALWAYS AS (
    CASE
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      WHEN score IS NOT NULL THEN 'detractor'
      ELSE null
    END
  ) STORED,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY nps_responses_own ON nps_responses USING (user_id = auth.uid());

-- Prevent sending duplicate NPS to same contact within 90 days
CREATE UNIQUE INDEX IF NOT EXISTS nps_responses_recent_idx
  ON nps_responses (user_id, contact_id)
  WHERE responded_at IS NULL OR sent_at > now() - interval '90 days';

-- ─── 3. Flow trigger helper RPC ────────────────────────────────────────────────
-- Used by flow engine to find which flow should handle an inbound message

CREATE OR REPLACE FUNCTION find_active_flow(
  p_user_id      uuid,
  p_trigger_type text,
  p_text         text DEFAULT NULL
) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM conversation_flows
  WHERE user_id = p_user_id
    AND is_active = true
    AND trigger_type = p_trigger_type
    AND (
      trigger_value IS NULL
      OR (p_text IS NOT NULL AND lower(p_text) LIKE '%' || lower(trigger_value) || '%')
    )
  LIMIT 1
$$;

-- ─── 4. NPS score aggregation helper ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_nps_score(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'score',      ROUND(
                    ((COUNT(*) FILTER (WHERE category = 'promoter')::numeric -
                      COUNT(*) FILTER (WHERE category = 'detractor')::numeric)
                    / NULLIF(COUNT(*), 0) * 100)
                  ),
    'promoters',  COUNT(*) FILTER (WHERE category = 'promoter'),
    'passives',   COUNT(*) FILTER (WHERE category = 'passive'),
    'detractors', COUNT(*) FILTER (WHERE category = 'detractor'),
    'total',      COUNT(*) FILTER (WHERE score IS NOT NULL),
    'pending',    COUNT(*) FILTER (WHERE score IS NULL),
    'avg_score',  ROUND(AVG(score) FILTER (WHERE score IS NOT NULL), 1)
  )
  FROM nps_responses
  WHERE user_id = p_user_id
    AND sent_at > now() - interval '90 days'
$$;
