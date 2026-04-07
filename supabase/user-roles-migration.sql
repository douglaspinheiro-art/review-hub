-- ============================================================
-- User Roles — Tabela dedicada com SECURITY DEFINER
-- ============================================================

-- 1. Enum de roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Policies para user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Security Definer function — bypassa RLS, evita recursão
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

-- 5. Migrar roles existentes de profiles para user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 
  CASE WHEN role = 'admin' THEN 'admin'::app_role ELSE 'user'::app_role END
FROM public.profiles
WHERE id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 6. Atualizar policy de webhook_logs para usar has_role
DROP POLICY IF EXISTS "logs_read_policy" ON webhook_logs;
CREATE POLICY "logs_read_policy" ON webhook_logs 
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    EXISTS (SELECT 1 FROM lojas WHERE id = loja_id AND user_id = auth.uid())
  );
