-- Criar tabela funil_page_metricas (referenciada por get_funil_page_data)
CREATE TABLE IF NOT EXISTS public.funil_page_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  periodo text NOT NULL CHECK (periodo IN ('7d','30d','90d')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ga4','auto')),
  metricas jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_ingested_at timestamptz,
  last_manual_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funil_page_metricas_store_periodo
  ON public.funil_page_metricas(store_id, periodo, created_at DESC);

ALTER TABLE public.funil_page_metricas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funil_page_metricas_tenant ON public.funil_page_metricas;
CREATE POLICY funil_page_metricas_tenant
  ON public.funil_page_metricas
  FOR ALL
  TO authenticated
  USING (public.auth_row_read_user_store(user_id, store_id))
  WITH CHECK (public.auth_row_write_user_store(user_id, store_id));

-- Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.touch_funil_page_metricas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funil_page_metricas_updated_at ON public.funil_page_metricas;
CREATE TRIGGER trg_funil_page_metricas_updated_at
  BEFORE UPDATE ON public.funil_page_metricas
  FOR EACH ROW EXECUTE FUNCTION public.touch_funil_page_metricas_updated_at();