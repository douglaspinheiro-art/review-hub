-- 3.4: Lead capture pre-paywall (público; usuário não autenticado)
CREATE TABLE IF NOT EXISTS public.shared_diagnostic_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  email text NOT NULL,
  name text,
  store_url text,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_diag_leads_token ON public.shared_diagnostic_leads(token);
CREATE INDEX IF NOT EXISTS idx_shared_diag_leads_email ON public.shared_diagnostic_leads(email);

ALTER TABLE public.shared_diagnostic_leads ENABLE ROW LEVEL SECURITY;

-- Insert público (anônimos podem deixar lead). SELECT bloqueado para todos no client.
DROP POLICY IF EXISTS shared_diagnostic_leads_anon_insert ON public.shared_diagnostic_leads;
CREATE POLICY shared_diagnostic_leads_anon_insert
  ON public.shared_diagnostic_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND token IS NOT NULL
  );

-- Apenas admin lê
DROP POLICY IF EXISTS shared_diagnostic_leads_admin_read ON public.shared_diagnostic_leads;
CREATE POLICY shared_diagnostic_leads_admin_read
  ON public.shared_diagnostic_leads
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));