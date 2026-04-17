-- Telemetria de funil pós-diagnóstico
CREATE TABLE IF NOT EXISTS public.funnel_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  recommended_plan text,
  selected_plan text,
  route text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_telemetry_user_created
  ON public.funnel_telemetry_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_funnel_telemetry_event_created
  ON public.funnel_telemetry_events (event_name, created_at DESC);

ALTER TABLE public.funnel_telemetry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funnel_telemetry_insert_own ON public.funnel_telemetry_events;
DROP POLICY IF EXISTS funnel_telemetry_select_own_or_admin ON public.funnel_telemetry_events;

-- Insert: o próprio usuário pode registar seus eventos
CREATE POLICY funnel_telemetry_insert_own
  ON public.funnel_telemetry_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Select: o próprio usuário vê seus eventos; admins veem tudo
CREATE POLICY funnel_telemetry_select_own_or_admin
  ON public.funnel_telemetry_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));