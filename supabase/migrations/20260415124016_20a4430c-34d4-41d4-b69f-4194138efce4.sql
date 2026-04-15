-- Add Mercado Pago columns to profiles (keep Stripe columns for backward compat)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mp_customer_id text,
  ADD COLUMN IF NOT EXISTS mp_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_mp_customer_id ON public.profiles (mp_customer_id) WHERE mp_customer_id IS NOT NULL;

-- Mercado Pago webhook events (idempotency + audit)
CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read webhook events (service_role inserts bypass RLS)
CREATE POLICY "mp_webhook_events_admin_read"
  ON public.mp_webhook_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));