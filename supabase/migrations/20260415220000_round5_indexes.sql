-- Round 5: Composite index for email_engagement_events.
-- Speeds up newsletter analytics queries that filter by campaign, user, and event type.

CREATE INDEX IF NOT EXISTS idx_email_engagement_campaign_user_type
  ON email_engagement_events(campaign_id, user_id, event_type);
