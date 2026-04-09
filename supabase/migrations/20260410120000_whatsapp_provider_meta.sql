-- Provedor WhatsApp: Evolution (legado) vs Meta Cloud API
-- Tokens Meta: preferir Vault em produção; coluna existe para MVP operacional.

alter table public.whatsapp_connections
  add column if not exists provider text not null default 'evolution';

alter table public.whatsapp_connections
  add constraint whatsapp_connections_provider_check
  check (provider in ('evolution', 'meta_cloud'));

comment on column public.whatsapp_connections.provider is 'evolution = Evolution API self-hosted; meta_cloud = WhatsApp Cloud API (Graph)';

alter table public.whatsapp_connections
  add column if not exists meta_phone_number_id text,
  add column if not exists meta_waba_id text,
  add column if not exists meta_access_token text,
  add column if not exists meta_api_version text default 'v21.0',
  add column if not exists meta_default_template_name text;

comment on column public.whatsapp_connections.meta_access_token is 'Token de longa duração Graph API; ideal migrar para Supabase Vault.';
comment on column public.whatsapp_connections.meta_default_template_name is 'Template aprovado Meta para campanhas fora da janela de 24h (nome exato no Business Manager).';

create index if not exists idx_whatsapp_connections_provider_store
  on public.whatsapp_connections (store_id, provider, status);
