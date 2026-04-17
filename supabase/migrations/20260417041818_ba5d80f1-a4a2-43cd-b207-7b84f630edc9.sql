-- Conversations: SLA + atribuição
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_conversations_store_sla
  ON public.conversations (store_id, sla_due_at)
  WHERE sla_due_at IS NOT NULL;

-- Abandoned carts: UTM
ALTER TABLE public.abandoned_carts
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text;

-- Stores: configuração comercial usada pelo funil
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS ticket_medio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_conversao numeric NOT NULL DEFAULT 2.5;