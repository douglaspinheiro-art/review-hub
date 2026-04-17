ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_type_check;

ALTER TABLE public.integrations ADD CONSTRAINT integrations_type_check
  CHECK (type = ANY (ARRAY[
    'shopify','nuvemshop','tray','vtex','woocommerce','magento','dizy','yampi',
    'hubspot','rdstation','mailchimp','google_my_business','reclame_aqui',
    'zenvia','twilio','custom'
  ]));