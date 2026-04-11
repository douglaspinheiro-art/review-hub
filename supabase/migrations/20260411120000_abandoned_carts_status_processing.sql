-- Permite estado intermédio usado por trigger-automations (claim atómico antes da cadência).
alter table public.abandoned_carts
  drop constraint if exists abandoned_carts_status_check;

alter table public.abandoned_carts
  add constraint abandoned_carts_status_check
  check (status in ('pending', 'processing', 'message_sent', 'recovered', 'expired'));
