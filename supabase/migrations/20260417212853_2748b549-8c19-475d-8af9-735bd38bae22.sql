-- Allow Google Analytics OAuth state rows
ALTER TABLE public.oauth_states DROP CONSTRAINT IF EXISTS oauth_states_platform_check;

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_platform_check
  CHECK (platform = ANY (ARRAY[
    'shopify','nuvemshop','tray','vtex','woocommerce','magento','dizy','yampi',
    'google','google_analytics','ga4',
    'meta','meta_whatsapp','facebook',
    'mercadopago'
  ]));