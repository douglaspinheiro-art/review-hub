-- ── affiliate_referrals: dono + admins de equipe do dono ───────────────────
DROP POLICY IF EXISTS affiliates_own ON public.affiliate_referrals;
CREATE POLICY affiliates_own ON public.affiliate_referrals
  FOR ALL TO authenticated
  USING ((referrer_id = (SELECT auth.uid())) OR public.auth_team_admin_owner(referrer_id))
  WITH CHECK ((referrer_id = (SELECT auth.uid())) OR public.auth_team_admin_owner(referrer_id));

-- ── journeys_config: dono da loja + equipe ─────────────────────────────────
DROP POLICY IF EXISTS journeys_config_own ON public.journeys_config;
CREATE POLICY journeys_config_own ON public.journeys_config
  FOR ALL TO authenticated
  USING (
    store_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = journeys_config.store_id AND s.user_id = (SELECT auth.uid()))
      OR public.auth_team_read_store(store_id)
    )
  )
  WITH CHECK (
    store_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = journeys_config.store_id AND s.user_id = (SELECT auth.uid()))
      OR public.auth_team_write_store(store_id)
    )
  );

-- ── loyalty_config: dono + equipe via store ───────────────────────────────
DROP POLICY IF EXISTS loyalty_config_own ON public.loyalty_config;
CREATE POLICY loyalty_config_own ON public.loyalty_config
  FOR ALL TO authenticated
  USING (
    store_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = loyalty_config.store_id AND s.user_id = (SELECT auth.uid()))
      OR public.auth_team_read_store(store_id)
    )
  )
  WITH CHECK (
    store_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = loyalty_config.store_id AND s.user_id = (SELECT auth.uid()))
      OR public.auth_team_write_store(store_id)
    )
  );

-- ── loyalty_points_v3 ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS loyalty_points_v3_own ON public.loyalty_points_v3;
CREATE POLICY loyalty_points_v3_own ON public.loyalty_points_v3
  FOR ALL TO authenticated
  USING (
    store_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = loyalty_points_v3.store_id AND s.user_id = (SELECT auth.uid()))
      OR public.auth_team_read_store(store_id)
    )
  )
  WITH CHECK (
    store_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.stores s WHERE s.id = loyalty_points_v3.store_id AND s.user_id = (SELECT auth.uid()))
      OR public.auth_team_write_store(store_id)
    )
  );

-- ── loyalty_rewards (apenas se a tabela existir e tiver store_id) ─────────
DO $$
DECLARE
  has_store_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loyalty_rewards' AND column_name = 'store_id'
  ) INTO has_store_id;

  IF has_store_id THEN
    EXECUTE 'DROP POLICY IF EXISTS loyalty_rewards_own ON public.loyalty_rewards';
    EXECUTE $POL$
      CREATE POLICY loyalty_rewards_own ON public.loyalty_rewards
        FOR ALL TO authenticated
        USING (
          store_id IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.stores s WHERE s.id = loyalty_rewards.store_id AND s.user_id = (SELECT auth.uid()))
            OR public.auth_team_read_store(store_id)
          )
        )
        WITH CHECK (
          store_id IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.stores s WHERE s.id = loyalty_rewards.store_id AND s.user_id = (SELECT auth.uid()))
            OR public.auth_team_write_store(store_id)
          )
        )
    $POL$;
  END IF;
END $$;