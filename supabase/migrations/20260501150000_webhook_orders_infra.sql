-- 20260501150000_webhook_orders_infra.sql
--
-- Infrastructure for the order ingestion pipeline (webhook-orders function).
--
-- 1. Ensure orders_v3 has all columns needed by the webhook-orders normalizer
-- 2. Unique index on (store_id, pedido_externo_id) for idempotent upserts
-- 3. Index on (store_id, cliente_id, created_at) for RFM queries
-- 4. RPC: upsert_order_with_customer — atomic customer + order upsert in one transaction

-- ── 1. Ensure required columns exist ─────────────────────────────────────────
DO $$
BEGIN
  -- pedido_externo_id is the platform-native order ID (idempotency key)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_v3' AND column_name = 'pedido_externo_id'
  ) THEN
    ALTER TABLE public.orders_v3 ADD COLUMN pedido_externo_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_v3' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.orders_v3 ADD COLUMN source text; -- shopify | woocommerce | vtex | nuvemshop | ...
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_v3' AND column_name = 'financial_status'
  ) THEN
    ALTER TABLE public.orders_v3 ADD COLUMN financial_status text; -- paid | pending | refunded
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_v3' AND column_name = 'fulfillment_status'
  ) THEN
    ALTER TABLE public.orders_v3 ADD COLUMN fulfillment_status text; -- fulfilled | unfulfilled | partial
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_v3' AND column_name = 'valor_desconto'
  ) THEN
    ALTER TABLE public.orders_v3 ADD COLUMN valor_desconto numeric(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders_v3' AND column_name = 'produtos_json'
  ) THEN
    ALTER TABLE public.orders_v3 ADD COLUMN produtos_json jsonb;
  END IF;
END $$;

-- ── 2. Unique index for idempotent upserts ────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_v3_store_external
  ON public.orders_v3 (store_id, pedido_externo_id)
  WHERE pedido_externo_id IS NOT NULL;

-- ── 3. Performance index for RFM + analytics ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_v3_store_cliente_created
  ON public.orders_v3 (store_id, cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_v3_store_status
  ON public.orders_v3 (store_id, status, created_at DESC);

-- ── 4. Atomic RPC: upsert customer + order in one transaction ─────────────────
CREATE OR REPLACE FUNCTION public.upsert_order_with_customer(
  p_user_id             uuid,
  p_store_id            uuid,
  p_phone               text,
  p_email               text,
  p_name                text,
  p_pedido_externo_id   text,
  p_source              text,
  p_valor               numeric,
  p_valor_desconto      numeric,
  p_valor_frete         numeric,
  p_status              text,
  p_financial_status    text,
  p_fulfillment_status  text,
  p_payment_method      text,
  p_produtos_json       jsonb,
  p_created_at          timestamptz
)
RETURNS jsonb   -- returns { customer_id, order_id, is_new_order }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_order_id    uuid;
  v_is_new      boolean := false;
BEGIN
  -- 1. Upsert customer (idempotent on store_id, phone)
  INSERT INTO public.customers_v3 (user_id, store_id, phone, email, name)
  VALUES (p_user_id, p_store_id, p_phone, p_email, p_name)
  ON CONFLICT (store_id, phone)
  DO UPDATE SET
    email = COALESCE(EXCLUDED.email, customers_v3.email),
    name  = COALESCE(NULLIF(EXCLUDED.name, ''), customers_v3.name)
  RETURNING id INTO v_customer_id;

  -- 2. Upsert order (idempotent on store_id, pedido_externo_id) — same transaction
  INSERT INTO public.orders_v3 (
    user_id, store_id, cliente_id, pedido_externo_id, source,
    valor, valor_desconto, valor_frete, status, financial_status,
    fulfillment_status, payment_method, produtos_json, created_at
  )
  VALUES (
    p_user_id, p_store_id, v_customer_id, p_pedido_externo_id, p_source,
    p_valor, p_valor_desconto, p_valor_frete, p_status, p_financial_status,
    p_fulfillment_status, p_payment_method, p_produtos_json, COALESCE(p_created_at, now())
  )
  ON CONFLICT (store_id, pedido_externo_id)
  DO UPDATE SET
    status               = EXCLUDED.status,
    financial_status     = EXCLUDED.financial_status,
    fulfillment_status   = EXCLUDED.fulfillment_status,
    valor                = EXCLUDED.valor,
    valor_desconto       = EXCLUDED.valor_desconto,
    valor_frete          = EXCLUDED.valor_frete,
    payment_method       = COALESCE(EXCLUDED.payment_method, orders_v3.payment_method),
    produtos_json        = COALESCE(EXCLUDED.produtos_json, orders_v3.produtos_json),
    updated_at           = now()
  RETURNING id,
    (xmax = 0) INTO v_order_id, v_is_new;  -- xmax=0 means INSERT (not UPDATE)

  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'order_id',    v_order_id,
    'is_new_order', v_is_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_order_with_customer(
  uuid, uuid, text, text, text, text, text,
  numeric, numeric, numeric, text, text, text, text, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_order_with_customer(
  uuid, uuid, text, text, text, text, text,
  numeric, numeric, numeric, text, text, text, text, jsonb, timestamptz
) TO service_role;
