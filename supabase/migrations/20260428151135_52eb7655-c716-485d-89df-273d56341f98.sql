-- Drop legacy signature
DROP FUNCTION IF EXISTS public.wa_admin_margin_report(date, date, uuid);

CREATE OR REPLACE FUNCTION public.wa_admin_margin_report(
  p_start timestamptz,
  p_end timestamptz,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  store_id uuid,
  store_name text,
  messages_count bigint,
  revenue_brl numeric,
  cost_brl numeric,
  margin_brl numeric,
  margin_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    e.store_id,
    s.name AS store_name,
    COUNT(*)::bigint AS messages_count,
    COALESCE(SUM(e.price_brl_charged), 0)::numeric AS revenue_brl,
    COALESCE(SUM(e.cost_brl_internal), 0)::numeric AS cost_brl,
    (COALESCE(SUM(e.price_brl_charged), 0) - COALESCE(SUM(e.cost_brl_internal), 0))::numeric AS margin_brl,
    CASE
      WHEN COALESCE(SUM(e.price_brl_charged), 0) > 0
        THEN ROUND(((SUM(e.price_brl_charged) - SUM(e.cost_brl_internal)) / SUM(e.price_brl_charged) * 100)::numeric, 2)
      ELSE 0
    END AS margin_pct
  FROM public.wa_usage_events e
  LEFT JOIN public.stores s ON s.id = e.store_id
  WHERE e.charged_at >= p_start
    AND e.charged_at < p_end
    AND (p_store_id IS NULL OR e.store_id = p_store_id)
  GROUP BY e.store_id, s.name
  ORDER BY margin_brl DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_admin_margin_report(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_admin_margin_report(timestamptz, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.wa_admin_margin_report IS
  'Admin-only WhatsApp margin report: revenue charged minus Meta internal cost per store and period.';

CREATE OR REPLACE FUNCTION public.wa_pricing_upsert(
  p_category text,
  p_country text,
  p_cost_brl numeric,
  p_price_brl numeric,
  p_effective_from timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  IF p_category NOT IN ('marketing','utility','authentication','service') THEN
    RAISE EXCEPTION 'invalid category: %', p_category;
  END IF;

  IF p_cost_brl < 0 OR p_price_brl < 0 THEN
    RAISE EXCEPTION 'cost and price must be non-negative';
  END IF;

  INSERT INTO public.wa_message_pricing (category, country, cost_brl, price_brl, effective_from)
  VALUES (p_category, p_country, p_cost_brl, p_price_brl, p_effective_from)
  ON CONFLICT (category, country, effective_from)
  DO UPDATE SET
    cost_brl = EXCLUDED.cost_brl,
    price_brl = EXCLUDED.price_brl
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid(),
    'wa_pricing_upsert',
    'wa_message_pricing',
    v_id::text,
    jsonb_build_object(
      'category', p_category,
      'country', p_country,
      'cost_brl', p_cost_brl,
      'price_brl', p_price_brl
    )
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_pricing_upsert(text, text, numeric, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_pricing_upsert(text, text, numeric, numeric, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.wa_pricing_upsert IS
  'Admin-only: upsert WhatsApp message pricing (Meta cost + sell price) for a category/country.';
