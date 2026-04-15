
-- Fix search_path on increment_daily_revenue overloads
DO $$ BEGIN
  ALTER FUNCTION increment_daily_revenue(date, numeric) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION increment_daily_revenue(uuid, date, numeric) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
