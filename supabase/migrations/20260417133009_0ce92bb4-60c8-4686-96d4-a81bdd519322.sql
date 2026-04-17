-- ── Backfill integrations.store_id for legacy NULL rows ───────────────────────
-- Link any orphan integration to the account owner's earliest store.
UPDATE public.integrations i
SET store_id = s.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.stores
  ORDER BY user_id, created_at ASC
) s
WHERE i.store_id IS NULL AND i.user_id = s.user_id;

-- Deactivate integrations that still have no store (no store ever existed for that user).
UPDATE public.integrations
SET is_active = false
WHERE store_id IS NULL AND is_active = true;

-- Deduplicate active integrations per (store_id, type): keep the most recently updated.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY store_id, type ORDER BY updated_at DESC, created_at DESC) AS rn
  FROM public.integrations
  WHERE is_active = true AND store_id IS NOT NULL
)
UPDATE public.integrations
SET is_active = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Unique active integration per store+type.
CREATE UNIQUE INDEX IF NOT EXISTS integrations_active_store_type_uidx
  ON public.integrations (store_id, type)
  WHERE is_active = true AND store_id IS NOT NULL;

-- ── channels: tighten store_id and RLS ────────────────────────────────────────
-- Backfill channels.store_id for legacy NULL rows.
UPDATE public.channels c
SET store_id = s.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.stores
  ORDER BY user_id, created_at ASC
) s
WHERE c.store_id IS NULL AND c.user_id = s.user_id;

-- Drop channels with no resolvable store (cannot be safely scoped).
DELETE FROM public.channels WHERE store_id IS NULL;

ALTER TABLE public.channels ALTER COLUMN store_id SET NOT NULL;

-- Replace permissive RLS with store-scoped policy using existing helper.
DROP POLICY IF EXISTS canais_own ON public.channels;

CREATE POLICY channels_tenant
  ON public.channels
  FOR ALL
  TO authenticated
  USING (auth_row_read_user_store(user_id, store_id))
  WITH CHECK (auth_row_write_user_store(user_id, store_id));
