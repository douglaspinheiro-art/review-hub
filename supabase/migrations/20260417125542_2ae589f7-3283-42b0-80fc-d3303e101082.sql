-- Tabela de estado de sincronização Dizy por loja (cursor incremental)
CREATE TABLE IF NOT EXISTS public.dizy_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  last_synced_at timestamptz,
  last_order_external_id text,
  last_run_status text DEFAULT 'idle',
  last_run_error text,
  last_run_at timestamptz,
  orders_imported_total bigint DEFAULT 0,
  customers_imported_total bigint DEFAULT 0,
  backfill_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dizy_sync_state ENABLE ROW LEVEL SECURITY;

-- Apenas leitura pelo dono da loja (writes via service_role nas edges)
CREATE POLICY "dizy_sync_state_read_owner"
ON public.dizy_sync_state
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.auth_team_read_store(store_id)
);

CREATE INDEX IF NOT EXISTS idx_dizy_sync_state_store ON public.dizy_sync_state(store_id);

-- Trigger updated_at
CREATE TRIGGER set_dizy_sync_state_updated_at
BEFORE UPDATE ON public.dizy_sync_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Índice de idempotência em orders_v3 (se ainda não existir)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_v3_store_external
ON public.orders_v3(store_id, pedido_externo_id)
WHERE pedido_externo_id IS NOT NULL;

-- Habilitar pg_cron e pg_net (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;