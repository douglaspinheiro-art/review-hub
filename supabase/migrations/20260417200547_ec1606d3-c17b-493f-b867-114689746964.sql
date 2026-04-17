-- 1) Subscription status column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'diagnostic_only';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('diagnostic_only','active','past_due','canceled'));

-- Backfill: anyone already on a paid plan is "active"; others "diagnostic_only".
UPDATE public.profiles
SET subscription_status = 'active'
WHERE subscription_status = 'diagnostic_only'
  AND plan IN ('growth','scale','enterprise');

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status
  ON public.profiles(subscription_status);

-- 2) Improve handle_new_user_store trigger to pick the best initial store name.
CREATE OR REPLACE FUNCTION public.handle_new_user_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '');
  IF v_name IS NULL THEN
    v_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  END IF;
  IF v_name IS NULL AND NEW.email IS NOT NULL THEN
    v_name := split_part(NEW.email, '@', 1);
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    v_name := 'Minha Loja';
  END IF;

  INSERT INTO public.stores (user_id, name)
  VALUES (NEW.id, v_name)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
