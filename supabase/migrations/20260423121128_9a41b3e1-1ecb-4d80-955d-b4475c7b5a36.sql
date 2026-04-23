-- Trigger helper local (idempotente)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.commercial_calendar_br (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  event_name text NOT NULL,
  category text NOT NULL,
  prep_window_days integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_date, event_name)
);
ALTER TABLE public.commercial_calendar_br ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_public_read" ON public.commercial_calendar_br;
CREATE POLICY "calendar_public_read" ON public.commercial_calendar_br
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_commercial_calendar_date ON public.commercial_calendar_br(event_date);

CREATE TABLE IF NOT EXISTS public.revenue_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  month_start date NOT NULL,
  goal_brl numeric(12,2) NOT NULL,
  autopilot_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, month_start)
);
ALTER TABLE public.revenue_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revenue_goals_tenant" ON public.revenue_goals;
CREATE POLICY "revenue_goals_tenant" ON public.revenue_goals
  FOR ALL TO authenticated
  USING (auth_row_read_user_store(user_id, store_id))
  WITH CHECK (auth_row_write_user_store(user_id, store_id));
DROP TRIGGER IF EXISTS trg_revenue_goals_touch ON public.revenue_goals;
CREATE TRIGGER trg_revenue_goals_touch BEFORE UPDATE ON public.revenue_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS ga4_attributed_revenue numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ga4_attributed_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_segment_benchmark(p_segment text, p_metric text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer; v_avg numeric; v_p50 numeric; v_p75 numeric;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.stores WHERE segment = p_segment;
  IF v_count < 10 THEN
    RETURN jsonb_build_object('insufficient_data', true, 'stores_count', v_count, 'stores_needed', 10 - v_count);
  END IF;
  IF p_metric = 'chs' THEN
    SELECT ROUND(AVG(conversion_health_score)::numeric, 1),
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY conversion_health_score)::numeric, 1),
           ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY conversion_health_score)::numeric, 1)
    INTO v_avg, v_p50, v_p75
    FROM public.stores WHERE segment = p_segment AND conversion_health_score IS NOT NULL;
  ELSIF p_metric = 'isl' THEN
    SELECT ROUND(AVG(isl_score)::numeric, 1),
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY isl_score)::numeric, 1),
           ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY isl_score)::numeric, 1)
    INTO v_avg, v_p50, v_p75
    FROM public.stores WHERE segment = p_segment AND isl_score IS NOT NULL;
  ELSE
    RETURN jsonb_build_object('error', 'invalid_metric');
  END IF;
  RETURN jsonb_build_object('insufficient_data', false, 'segment', p_segment, 'metric', p_metric,
    'sample_size', v_count, 'avg', v_avg, 'p50', v_p50, 'p75', v_p75);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_segment_benchmark(text, text) TO authenticated;

INSERT INTO public.commercial_calendar_br (event_date, event_name, category, prep_window_days) VALUES
  ('2026-02-14', 'Dia dos Namorados (US/Internacional)', 'romantic', 21),
  ('2026-03-08', 'Dia Internacional da Mulher', 'awareness', 14),
  ('2026-03-15', 'Consumer Day', 'sales', 14),
  ('2026-05-10', 'Dia das Mães', 'family', 30),
  ('2026-06-12', 'Dia dos Namorados (BR)', 'romantic', 21),
  ('2026-07-15', 'Liquida Brasil', 'sales', 14),
  ('2026-08-09', 'Dia dos Pais', 'family', 30),
  ('2026-09-15', 'Semana do Brasil', 'sales', 14),
  ('2026-10-12', 'Dia das Crianças', 'family', 21),
  ('2026-11-27', 'Black Friday', 'sales', 45),
  ('2026-11-30', 'Cyber Monday', 'sales', 45),
  ('2026-12-25', 'Natal', 'family', 45)
ON CONFLICT (event_date, event_name) DO NOTHING;