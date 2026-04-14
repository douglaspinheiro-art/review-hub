-- Per-store webhook credentials used by edge webhook verification.
alter table public.integrations
  add column if not exists webhook_secret text,
  add column if not exists webhook_token text;

comment on column public.integrations.webhook_secret
  is 'Per-store webhook signing secret (e.g. Shopify/WooCommerce HMAC secret).';
comment on column public.integrations.webhook_token
  is 'Per-store webhook token (e.g. Nuvemshop notification token).';

alter table public.integrations
  drop constraint if exists integrations_webhook_secret_not_blank;
alter table public.integrations
  add constraint integrations_webhook_secret_not_blank
  check (webhook_secret is null or btrim(webhook_secret) <> '');

alter table public.integrations
  drop constraint if exists integrations_webhook_token_not_blank;
alter table public.integrations
  add constraint integrations_webhook_token_not_blank
  check (webhook_token is null or btrim(webhook_token) <> '');

create index if not exists integrations_store_type_active_idx
  on public.integrations (store_id, type, is_active);
