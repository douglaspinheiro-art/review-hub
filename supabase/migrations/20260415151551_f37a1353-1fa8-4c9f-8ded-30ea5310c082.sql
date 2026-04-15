
-- OAuth state tokens for CSRF protection during platform connection
CREATE TABLE public.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('shopify', 'nuvemshop', 'woocommerce')),
  redirect_url text,
  extra_data jsonb DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup and cleanup
CREATE INDEX idx_oauth_states_token ON public.oauth_states (state_token);
CREATE INDEX idx_oauth_states_expires ON public.oauth_states (expires_at);

-- Enable RLS
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own states
CREATE POLICY "oauth_states_insert_own"
  ON public.oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "oauth_states_select_own"
  ON public.oauth_states FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "oauth_states_delete_own"
  ON public.oauth_states FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role cleanup function (called by edge functions)
CREATE OR REPLACE FUNCTION public.consume_oauth_state(p_token text)
RETURNS TABLE(store_id uuid, user_id uuid, platform text, extra_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM public.oauth_states
  WHERE state_token = p_token
    AND expires_at > now()
  RETURNING oauth_states.store_id, oauth_states.user_id, oauth_states.platform, oauth_states.extra_data;
END;
$$;
