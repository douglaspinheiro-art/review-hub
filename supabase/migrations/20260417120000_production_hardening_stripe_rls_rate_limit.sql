-- Produção: idempotência Stripe, logs de rate limit, fila webhook dead-letter, has_role sem vazamento.

-- ── Stripe webhook idempotência (Edge `stripe-webhook`, service_role) ─────────
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb
);

create index if not exists idx_stripe_webhook_events_received
  on public.stripe_webhook_events (received_at desc);

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from public;
grant select, insert, delete on public.stripe_webhook_events to service_role;

-- ── api_request_logs (rate limit distribuído nas Edges) ───────────────────────
create table if not exists public.api_request_logs (
  id bigserial primary key,
  rate_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_request_logs_rate_key_created
  on public.api_request_logs (rate_key, created_at desc);

alter table public.api_request_logs enable row level security;

revoke all on public.api_request_logs from public;
grant select, insert, delete on public.api_request_logs to service_role;

comment on table public.api_request_logs is 'Inserções por requisição para rate limiting distribuído; aplicar retenção/prune periódica em produção.';

-- ── webhook_queue: estado dead_letter + retries controlados pelo worker ───
alter table public.webhook_queue drop constraint if exists webhook_queue_status_chk;
alter table public.webhook_queue drop constraint if exists webhook_queue_status_check;
alter table public.webhook_queue
  add constraint webhook_queue_status_chk
  check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter'));

-- ── has_role: não expor papel de terceiros a utilizadores não-admin ─────────
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = _user_id
        and ur.role = _role
    )
    and (
      auth.uid() = _user_id
      or exists (
        select 1
        from public.user_roles ar
        where ar.user_id = auth.uid()
          and ar.role = 'admin'::public.app_role
      )
    );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;
