-- Public, non-secret metadata for integration UI (tenant-safe listing).
-- Secrets remain in config / encrypted columns only.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS connection_mode text,
  ADD COLUMN IF NOT EXISTS connection_status text;

COMMENT ON COLUMN public.integrations.connection_mode IS 'oauth | manual | assisted — how credentials were obtained (UI/metadata only).';
COMMENT ON COLUMN public.integrations.connection_status IS 'connected | pending_action | manual_required | failed — coarse UX state per store.';
