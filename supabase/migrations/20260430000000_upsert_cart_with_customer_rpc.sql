-- Migration: upsert_cart_with_customer RPC
--
-- Purpose: Atomically upserts a customer row in customers_v3 and a cart row in
-- abandoned_carts within a single transaction. Replaces the two-step UPSERT
-- sequence in process-scheduled-messages that was vulnerable to partial failure
-- (customer created but cart insert fails → orphaned customer row, no recovery
-- automation triggered).
--
-- Called by: supabase/functions/process-scheduled-messages/index.ts
-- Security: SECURITY DEFINER runs with owner privileges so the service-role
-- caller does not need direct INSERT/UPDATE grants beyond what RLS allows.
-- SET search_path pins to 'public' to prevent search_path hijacking.

CREATE OR REPLACE FUNCTION public.upsert_cart_with_customer(
  p_user_id           uuid,
  p_store_id          uuid,
  p_phone             text,
  p_email             text,
  p_name              text,
  p_external_id       text,
  p_source            text,
  p_cart_value        numeric,
  p_cart_items        jsonb,
  p_recovery_url      text,
  p_raw_payload       jsonb,
  p_utm_source        text,
  p_utm_medium        text,
  p_utm_campaign      text,
  p_shipping_value    numeric,
  p_shipping_zip_code text,
  p_payment_failure_reason text,
  p_inventory_status  text,
  p_abandon_step      text
)
RETURNS uuid   -- returns the customer id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  -- 1. Upsert customer (idempotent on store_id, phone)
  INSERT INTO public.customers_v3 (user_id, store_id, phone, email, name)
  VALUES (p_user_id, p_store_id, p_phone, p_email, p_name)
  ON CONFLICT (store_id, phone)
  DO UPDATE SET
    email = EXCLUDED.email,
    name  = EXCLUDED.name
  RETURNING id INTO v_customer_id;

  -- 2. Upsert cart (idempotent on store_id, external_id) — runs in the SAME transaction
  INSERT INTO public.abandoned_carts (
    user_id, store_id, customer_id, external_id, source,
    cart_value, cart_items, recovery_url, status, raw_payload,
    utm_source, utm_medium, utm_campaign,
    shipping_value, shipping_zip_code,
    payment_failure_reason, inventory_status, abandon_step
  )
  VALUES (
    p_user_id, p_store_id, v_customer_id, p_external_id, p_source,
    p_cart_value, p_cart_items, p_recovery_url, 'pending', p_raw_payload,
    p_utm_source, p_utm_medium, p_utm_campaign,
    p_shipping_value, p_shipping_zip_code,
    p_payment_failure_reason, p_inventory_status, p_abandon_step
  )
  ON CONFLICT (store_id, external_id)
  DO UPDATE SET
    customer_id             = EXCLUDED.customer_id,
    cart_value              = EXCLUDED.cart_value,
    cart_items              = EXCLUDED.cart_items,
    recovery_url            = EXCLUDED.recovery_url,
    raw_payload             = EXCLUDED.raw_payload,
    utm_source              = EXCLUDED.utm_source,
    utm_medium              = EXCLUDED.utm_medium,
    utm_campaign            = EXCLUDED.utm_campaign,
    shipping_value          = EXCLUDED.shipping_value,
    shipping_zip_code       = EXCLUDED.shipping_zip_code,
    payment_failure_reason  = EXCLUDED.payment_failure_reason,
    inventory_status        = EXCLUDED.inventory_status,
    abandon_step            = EXCLUDED.abandon_step,
    updated_at              = now();

  RETURN v_customer_id;
END;
$$;
