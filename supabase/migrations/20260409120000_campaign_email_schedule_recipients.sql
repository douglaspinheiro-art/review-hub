-- Persist newsletter recipient segment so scheduled sends know whom to target.

alter table public.campaigns add column if not exists email_recipient_mode text default 'all';
alter table public.campaigns add column if not exists email_recipient_tag text;
alter table public.campaigns add column if not exists email_recipient_rfm text;

comment on column public.campaigns.email_recipient_mode is 'Newsletter: all | tag | rfm';
comment on column public.campaigns.email_recipient_tag is 'When mode=tag, tag value on customers_v3.tags';
comment on column public.campaigns.email_recipient_rfm is 'When mode=rfm, rfm_segment value';
