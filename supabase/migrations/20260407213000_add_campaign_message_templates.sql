-- Reusable message template library for campaigns.

create table if not exists public.campaign_message_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  objective text not null,
  channel text not null default 'whatsapp',
  message text not null,
  whatsapp_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_message_templates_user
  on public.campaign_message_templates(user_id, created_at desc);

alter table public.campaign_message_templates enable row level security;

drop policy if exists campaign_message_templates_own on public.campaign_message_templates;
create policy campaign_message_templates_own
  on public.campaign_message_templates
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace trigger campaign_message_templates_updated_at
before update on public.campaign_message_templates
for each row execute procedure public.set_updated_at();
