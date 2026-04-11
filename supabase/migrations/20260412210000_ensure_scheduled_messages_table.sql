-- Garante scheduled_messages em projetos que não aplicaram 20240407000300 (v4 automations).
-- Alinha com dispatch-campaign, flow-engine, process-scheduled-messages e trigger-automations.

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers_v3(id) on delete cascade,
  journey_id uuid,
  campaign_id uuid references public.campaigns(id) on delete set null,
  message_content text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}',
  error_message text,
  processed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS journey_id uuid;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS campaign_id uuid references public.campaigns(id) on delete set null;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.scheduled_messages ADD COLUMN IF NOT EXISTS metadata jsonb default '{}';

-- Versões antigas não permitiam status 'processing' (worker).
DO $drop_sched_checks$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'scheduled_messages'
      AND c.contype = 'c'
  LOOP
    EXECUTE format('alter table public.scheduled_messages drop constraint %I', r.conname);
  END LOOP;
END
$drop_sched_checks$;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_status_chk
  CHECK (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_scheduled_time ON public.scheduled_messages (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_store_status ON public.scheduled_messages (store_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_journey_id ON public.scheduled_messages (journey_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_campaign_id ON public.scheduled_messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_worker_lookup ON public.scheduled_messages (status, scheduled_for) WHERE status = 'pending';

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own scheduled_messages" ON public.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_own ON public.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_tenant ON public.scheduled_messages;

CREATE POLICY scheduled_messages_tenant ON public.scheduled_messages
  FOR ALL TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));
