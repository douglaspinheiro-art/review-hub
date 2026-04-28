CREATE TABLE IF NOT EXISTS public.metricas_enriquecidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  periodo text NOT NULL DEFAULT '30d',
  receita_travada_frete numeric(12,2) NOT NULL DEFAULT 0,
  receita_travada_pagamento numeric(12,2) NOT NULL DEFAULT 0,
  total_abandonos_frete integer NOT NULL DEFAULT 0,
  total_abandonos_pagamento integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metricas_enriquecidas_store_periodo
  ON public.metricas_enriquecidas(store_id, periodo, created_at DESC);

ALTER TABLE public.metricas_enriquecidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage metricas_enriquecidas" ON public.metricas_enriquecidas;
CREATE POLICY "Owners manage metricas_enriquecidas"
  ON public.metricas_enriquecidas
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid()));

CREATE OR REPLACE TRIGGER metricas_enriquecidas_updated_at
  BEFORE UPDATE ON public.metricas_enriquecidas
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();