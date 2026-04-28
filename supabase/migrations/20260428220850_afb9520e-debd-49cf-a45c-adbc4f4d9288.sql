-- Create missing data_health_v3 table referenced by get_funil_page_data RPC
CREATE TABLE IF NOT EXISTS public.data_health_v3 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL DEFAULT '30d',
  score NUMERIC(5,2),
  status TEXT,
  alertas JSONB DEFAULT '[]'::jsonb,
  recomendacoes_confiaveis JSONB DEFAULT '[]'::jsonb,
  metric_contract JSONB DEFAULT '{}'::jsonb,
  canais JSONB DEFAULT '{}'::jsonb,
  etapas JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_health_v3_store_periodo
  ON public.data_health_v3(store_id, periodo, created_at DESC);

ALTER TABLE public.data_health_v3 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their data health"
  ON public.data_health_v3 FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = data_health_v3.store_id AND s.user_id = auth.uid()));

CREATE POLICY "Store owners can insert their data health"
  ON public.data_health_v3 FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = data_health_v3.store_id AND s.user_id = auth.uid()));

CREATE POLICY "Store owners can update their data health"
  ON public.data_health_v3 FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = data_health_v3.store_id AND s.user_id = auth.uid()));

CREATE POLICY "Store owners can delete their data health"
  ON public.data_health_v3 FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = data_health_v3.store_id AND s.user_id = auth.uid()));

CREATE TRIGGER set_data_health_v3_updated_at
  BEFORE UPDATE ON public.data_health_v3
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();