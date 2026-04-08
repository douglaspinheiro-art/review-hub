-- Newsletter: per-recipient tracking, engagement events, deliverability fields,
-- catalog image URL, A/B subject columns, saved blocks.

-- Recipients (one row per newsletter send target — id used in open/click pixels)
create table if not exists public.newsletter_send_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers_v3(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists idx_newsletter_send_recipients_campaign
  on public.newsletter_send_recipients(campaign_id);
create index if not exists idx_newsletter_send_recipients_customer
  on public.newsletter_send_recipients(customer_id);

-- Dedupe: one tracking row per campaign per customer per send batch
create unique index if not exists newsletter_send_recipients_campaign_customer
  on public.newsletter_send_recipients(campaign_id, customer_id);

create table if not exists public.email_engagement_events (
  id uuid primary key default gen_random_uuid(),
  send_recipient_id uuid not null references public.newsletter_send_recipients(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers_v3(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('open', 'click')),
  link_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_engagement_campaign
  on public.email_engagement_events(campaign_id);
create index if not exists idx_email_engagement_type
  on public.email_engagement_events(campaign_id, event_type);

alter table public.stores add column if not exists email_from_address text;
alter table public.stores add column if not exists email_reply_to text;
alter table public.stores add column if not exists brand_primary_color text;

alter table public.campaigns add column if not exists preheader text;
alter table public.campaigns add column if not exists click_count int not null default 0;
alter table public.campaigns add column if not exists subject_variant_b text;
alter table public.campaigns add column if not exists ab_subject_enabled boolean not null default false;

alter table public.products add column if not exists imagem_url text;

alter table public.customers_v3 add column if not exists email_hard_bounce_at timestamptz;
alter table public.customers_v3 add column if not exists email_complaint_at timestamptz;
alter table public.customers_v3 add column if not exists tags text[] default '{}';
alter table public.customers_v3 add column if not exists unsubscribed_at timestamptz;

create table if not exists public.newsletter_saved_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists idx_newsletter_saved_blocks_user
  on public.newsletter_saved_blocks(user_id);

-- RLS
alter table public.newsletter_send_recipients enable row level security;
alter table public.email_engagement_events enable row level security;
alter table public.newsletter_saved_blocks enable row level security;

drop policy if exists "newsletter_send_recipients_own" on public.newsletter_send_recipients;
create policy "newsletter_send_recipients_own" on public.newsletter_send_recipients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "email_engagement_events_own" on public.email_engagement_events;
create policy "email_engagement_events_own" on public.email_engagement_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "newsletter_saved_blocks_own" on public.newsletter_saved_blocks;
create policy "newsletter_saved_blocks_own" on public.newsletter_saved_blocks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
