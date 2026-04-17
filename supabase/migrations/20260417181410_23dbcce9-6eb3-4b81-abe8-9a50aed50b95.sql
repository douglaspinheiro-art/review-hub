-- P0: Add explicit deny policies to api_request_logs and rate_limits
-- (RLS enabled but no policies → unpredictable behavior).
-- service_role bypasses RLS so internal usage continues working.

-- api_request_logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='api_request_logs' AND policyname='deny_all_authenticated') THEN
    CREATE POLICY "deny_all_authenticated" ON public.api_request_logs
      FOR ALL TO authenticated
      USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='api_request_logs' AND policyname='deny_all_anon') THEN
    CREATE POLICY "deny_all_anon" ON public.api_request_logs
      FOR ALL TO anon
      USING (false) WITH CHECK (false);
  END IF;
END $$;

-- rate_limits (skip if table doesn't exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rate_limits') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rate_limits' AND policyname='deny_all_authenticated') THEN
      CREATE POLICY "deny_all_authenticated" ON public.rate_limits
        FOR ALL TO authenticated
        USING (false) WITH CHECK (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rate_limits' AND policyname='deny_all_anon') THEN
      CREATE POLICY "deny_all_anon" ON public.rate_limits
        FOR ALL TO anon
        USING (false) WITH CHECK (false);
    END IF;
  END IF;
END $$;

-- Note: resolve_loyalty_by_phone keeps GRANT TO anon intentionally —
-- it powers the public loyalty portal /p/:slug and only returns data
-- scoped to the phone number provided by the caller (SECURITY DEFINER isolates by slug).
