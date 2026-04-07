
-- 1. system_config table for maintenance mode etc.
CREATE TABLE IF NOT EXISTS public.system_config (
  id text PRIMARY KEY DEFAULT 'config_geral',
  maintenance_active boolean NOT NULL DEFAULT false,
  maintenance_message text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read system config
CREATE POLICY "system_config_read_all" ON public.system_config
  FOR SELECT TO authenticated USING (true);

-- Insert default row if not exists
INSERT INTO public.system_config (id, maintenance_active, maintenance_message)
VALUES ('config_geral', false, null)
ON CONFLICT (id) DO NOTHING;

-- 2. user_roles table + has_role function
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own roles" ON public.user_roles
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 3. Auto-create store on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.stores (user_id, name, segment)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'company_name', 'Minha Loja'),
    'Outro'
  )
  ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;

-- Drop if exists then create trigger
DROP TRIGGER IF EXISTS on_auth_user_created_store ON auth.users;
CREATE TRIGGER on_auth_user_created_store
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_store();

-- 4. Migrate existing profiles.role to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 
  CASE WHEN role = 'admin' THEN 'admin'::app_role ELSE 'user'::app_role END
FROM public.profiles
WHERE id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
