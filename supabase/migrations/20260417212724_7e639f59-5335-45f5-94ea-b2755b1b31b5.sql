
-- 1. Add unique constraint required by upsert(onConflict: "store_id,type")
-- Clean up potential duplicates first to avoid constraint failure
DELETE FROM public.integrations a
USING public.integrations b
WHERE a.store_id IS NOT NULL
  AND a.store_id = b.store_id
  AND a.type = b.type
  AND a.ctid < b.ctid;

ALTER TABLE public.integrations
  DROP CONSTRAINT IF EXISTS integrations_store_id_type_unique;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_store_id_type_unique UNIQUE (store_id, type);

-- 2. Promote douglapinheirosantos@gmail.com to platform admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('7c2ceba0-ef18-45be-bc51-622335adeae5', 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- Also reflect on profiles.role for tenant-admin checks
UPDATE public.profiles
SET role = 'admin'
WHERE id = '7c2ceba0-ef18-45be-bc51-622335adeae5';
