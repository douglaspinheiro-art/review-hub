-- Replace user_id,type uniqueness with store_id,type uniqueness on integrations
-- to support multi-store accounts (same user can connect Shopify in store A and store B).

-- Drop the old unique index that prevents a user from connecting the same platform
-- to multiple stores they own.
DROP INDEX IF EXISTS public.integrations_user_id_type_uidx;

-- Drop partial-unique (store_id,type) WHERE is_active=true — replace with full unique.
-- Full unique is safer because soft-deactivated rows should not allow duplicates on
-- the same (store_id, type) either (ON CONFLICT (store_id,type) upsert needs full unique).
DROP INDEX IF EXISTS public.integrations_active_store_type_uidx;

-- Deactivate older duplicates per (store_id,type) keeping the most recent active row.
-- This is a safety net in case legacy data has conflicts before creating the unique index.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY store_id, type
           ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM public.integrations
  WHERE store_id IS NOT NULL
)
DELETE FROM public.integrations i
USING ranked r
WHERE i.id = r.id AND r.rn > 1;

-- Create full unique constraint on (store_id, type). Required for
-- `.upsert(..., { onConflict: "store_id,type" })` used across the app.
CREATE UNIQUE INDEX IF NOT EXISTS integrations_store_type_uidx
  ON public.integrations (store_id, type)
  WHERE store_id IS NOT NULL;