-- Operational data blueprint: orders enrichment, funil GA4 storage, quality snapshots,
-- abandoned cart step, catalog / order / shipping events, cohorts, attribution UTM columns.

-- ─── orders_v3: shipping, payment, internal status ─────────────────────────
DO $$
BEGIN
  IF to_regclass('public.orders_v3') IS NOT NULL THEN
    ALTER TABLE public.orders_v3 ADD COLUMN IF NOT EXISTS valor_frete numeric(12,2);
    ALTER TABLE public.orders_v3 ADD COLUMN IF NOT EXISTS payment_method text;
    ALTER TABLE public.orders_v3 ADD COLUMN IF NOT EXISTS payment_installments integer;
    ALTER TABLE public.orders_v3 ADD COLUMN IF NOT EXISTS internal_status text;
  END IF;
END $$;

-- Net revenue view (gross = valor; discount/frete explícitos quando preenchidos)
CREATE OR REPLACE VIEW public.v_orders_net_revenue AS
SELECT
  o.id,
  o.store_id,
  o.user_id,
  o.valor AS gross_revenue,
  COALESCE(o.valor_desconto, 0)::numeric(12,2) AS discount_total,
  COALESCE(o.valor_frete, 0)::numeric(12,2) AS shipping_total,
  (o.valor - COALESCE(o.valor_desconto, 0))::numeric(12,2) AS net_revenue
FROM public.orders_v3 o;

COMMENT ON VIEW public.v_orders_net_revenue IS 'Pedido: receita bruta, desconto, frete e líquido simples (valor - desconto).';

-- Line items exploded from produtos_json [{ sku, nome, qtd }]
CREATE OR REPLACE VIEW public.v_order_line_items AS
SELECT
  o.id AS order_id,
  o.store_id,
  o.user_id,
  elem->>'sku' AS sku,
  elem->>'nome' AS product_name,
  COALESCE(NULLIF(elem->>'qtd', '')::integer, 1) AS quantity
FROM public.orders_v3 o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN o.produtos_json IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(o.produtos_json::jsonb) = 'array' THEN o.produtos_json::jsonb
    ELSE '[]'::jsonb
  END
) AS elem;

COMMENT ON VIEW public.v_order_line_items IS 'Itens do pedido a partir de produtos_json (sku, nome, qtd).';

GRANT SELECT ON public.v_orders_net_revenue TO authenticated;
GRANT SELECT ON public.v_order_line_items TO authenticated;

-- ─── funil_diario (GA4 snapshot por loja) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funil_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  periodo text NOT NULL CHECK (periodo IN ('7d', '30d', '90d')),
  fonte text NOT NULL DEFAULT 'ga4',
  sessions bigint,
  view_item bigint,
  add_to_cart bigint,
  begin_checkout bigint,
  purchases bigint,
  purchase_revenue numeric(14,2),
  ga4_purchase_vs_orders_diff_pct numeric(8,2),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, metric_date, periodo, fonte)
);

CREATE INDEX IF NOT EXISTS idx_funil_diario_store_date ON public.funil_diario(store_id, metric_date DESC);

ALTER TABLE public.funil_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funil_diario_own ON public.funil_diario;
CREATE POLICY funil_diario_own ON public.funil_diario
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── data_quality_snapshots ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_quality_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  duplicate_order_rate numeric(8,4),
  parse_error_rate numeric(8,4),
  phone_fill_rate numeric(8,4),
  utm_fill_rate numeric(8,4),
  ga4_purchase_vs_orders_diff_pct numeric(8,2),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_data_quality_store_date ON public.data_quality_snapshots(store_id, snapshot_date DESC);

ALTER TABLE public.data_quality_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_quality_snapshots_own ON public.data_quality_snapshots;
CREATE POLICY data_quality_snapshots_own ON public.data_quality_snapshots
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── abandoned_carts: etapa de abandono ────────────────────────────────────
ALTER TABLE public.abandoned_carts ADD COLUMN IF NOT EXISTS abandon_step text;

COMMENT ON COLUMN public.abandoned_carts.abandon_step IS 'Etapa heurística do checkout (ex: contact_information, shipping, payment).';

-- ─── attribution_events: UTM (se tabela existir) ─────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.attribution_events') IS NOT NULL THEN
    ALTER TABLE public.attribution_events ADD COLUMN IF NOT EXISTS utm_source text;
    ALTER TABLE public.attribution_events ADD COLUMN IF NOT EXISTS utm_medium text;
    ALTER TABLE public.attribution_events ADD COLUMN IF NOT EXISTS utm_campaign text;
  END IF;
END $$;

-- ─── catalog_snapshot (espelho periódico de estoque/catálogo) ──────────────
CREATE TABLE IF NOT EXISTS public.catalog_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku text NOT NULL,
  product_name text,
  stock_qty integer,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_snapshot_store_captured ON public.catalog_snapshot(store_id, captured_at DESC);

ALTER TABLE public.catalog_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_snapshot_own ON public.catalog_snapshot;
CREATE POLICY catalog_snapshot_own ON public.catalog_snapshot
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── order_events (cancelamento / devolução / etc.) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_externo_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('cancelled', 'returned', 'refunded', 'shipped', 'delivered')),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_order_events_store_external ON public.order_events(store_id, pedido_externo_id);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_events_own ON public.order_events;
CREATE POLICY order_events_own ON public.order_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── shipping_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipping_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_externo_id text NOT NULL,
  delivery_eta timestamptz,
  delivered_at timestamptz,
  carrier text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_events_store_order ON public.shipping_events(store_id, pedido_externo_id);

ALTER TABLE public.shipping_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_events_own ON public.shipping_events;
CREATE POLICY shipping_events_own ON public.shipping_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── customer_cohorts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort_month date NOT NULL,
  cohort_size integer NOT NULL DEFAULT 0,
  retention_d30 numeric(8,4),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, cohort_month)
);

CREATE INDEX IF NOT EXISTS idx_customer_cohorts_store ON public.customer_cohorts(store_id, cohort_month DESC);

ALTER TABLE public.customer_cohorts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_cohorts_own ON public.customer_cohorts;
CREATE POLICY customer_cohorts_own ON public.customer_cohorts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
