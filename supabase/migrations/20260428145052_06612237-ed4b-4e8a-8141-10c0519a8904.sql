-- ============================================================================
-- WhatsApp-as-a-Service — Wallet de mensagens (etapa 1)
-- ============================================================================

-- ── 1. wa_message_pricing (custo Meta + preço de venda) ────────────────────
create table if not exists public.wa_message_pricing (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('marketing','utility','authentication','service')),
  country text not null default 'BR',
  cost_brl numeric(10,4) not null default 0,        -- SENSÍVEL: custo Meta
  price_brl numeric(10,4) not null default 0,       -- preço cobrado da loja
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wa_pricing_active_unique
  on public.wa_message_pricing (category, country)
  where active = true;
comment on table public.wa_message_pricing is 'Tabela de preço Meta (custo) e preço cobrado (venda). SELECT restrito a admin.';
comment on column public.wa_message_pricing.cost_brl is 'SENSÍVEL — custo Meta por mensagem. Nunca expor à loja.';

alter table public.wa_message_pricing enable row level security;

create policy wa_pricing_admin_only on public.wa_message_pricing
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 2. wa_message_packs (catálogo público de pacotes) ─────────────────────
create table if not exists public.wa_message_packs (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  messages_count integer not null check (messages_count > 0),
  price_brl numeric(10,2) not null check (price_brl >= 0),
  category text not null default 'marketing' check (category in ('marketing','utility','authentication','service','any')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wa_message_packs enable row level security;

create policy wa_packs_read_all on public.wa_message_packs
  for select to authenticated using (active = true or public.has_role(auth.uid(), 'admin'::app_role));
create policy wa_packs_admin_write on public.wa_message_packs
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 3. wa_wallets (saldo por loja) ────────────────────────────────────────
create table if not exists public.wa_wallets (
  store_id uuid primary key references public.stores(id) on delete cascade,
  user_id uuid not null,
  included_quota integer not null default 0,         -- franquia do plano no ciclo
  used_in_cycle integer not null default 0,           -- consumido neste ciclo
  purchased_balance integer not null default 0,       -- pacotes (não expira no ciclo)
  cycle_start timestamptz not null default date_trunc('month', now()),
  cycle_end timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  hard_limit_brl numeric(10,2),                       -- proteção opcional por valor
  soft_limit_pct integer not null default 80 check (soft_limit_pct between 1 and 100),
  auto_recharge_enabled boolean not null default false,
  auto_recharge_pack_id uuid references public.wa_message_packs(id),
  status text not null default 'active' check (status in ('active','suspended')),
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_wa_wallets_user on public.wa_wallets(user_id);
create index if not exists idx_wa_wallets_status on public.wa_wallets(status) where status = 'suspended';

alter table public.wa_wallets enable row level security;

create policy wa_wallets_tenant_read on public.wa_wallets
  for select to authenticated
  using (public.auth_row_read_user_store(user_id, store_id));

-- INSERT/UPDATE/DELETE só via RPCs SECURITY DEFINER ou admin
create policy wa_wallets_admin_write on public.wa_wallets
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 4. wa_pack_purchases ──────────────────────────────────────────────────
create table if not exists public.wa_pack_purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null,
  pack_id uuid not null references public.wa_message_packs(id),
  messages_credited integer not null,
  price_brl numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  mp_payment_id text,
  mp_external_reference text,
  paid_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_pack_purchases_store_created
  on public.wa_pack_purchases(store_id, created_at desc);
create index if not exists idx_wa_pack_purchases_mp_payment on public.wa_pack_purchases(mp_payment_id);

alter table public.wa_pack_purchases enable row level security;

create policy wa_pack_purchases_tenant_read on public.wa_pack_purchases
  for select to authenticated
  using (public.auth_row_read_user_store(user_id, store_id));

create policy wa_pack_purchases_admin_all on public.wa_pack_purchases
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 5. wa_usage_events (uma linha por mensagem cobrada) ───────────────────
create table if not exists public.wa_usage_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null,
  scheduled_message_id uuid,
  wamid text,                                         -- id Meta da mensagem
  category text not null check (category in ('marketing','utility','authentication','service')),
  country text not null default 'BR',
  cost_brl_internal numeric(10,4) not null default 0, -- SENSÍVEL
  price_brl_charged numeric(10,4) not null default 0,
  source text not null check (source in ('included','purchased')),
  status text not null default 'reserved' check (status in ('reserved','confirmed','refunded','failed')),
  charged_at timestamptz not null default now(),
  confirmed_at timestamptz,
  refunded_at timestamptz,
  refund_reason text
);
create index if not exists idx_wa_usage_events_store_charged
  on public.wa_usage_events(store_id, charged_at desc);
create index if not exists idx_wa_usage_events_scheduled
  on public.wa_usage_events(scheduled_message_id) where scheduled_message_id is not null;
create index if not exists idx_wa_usage_events_wamid
  on public.wa_usage_events(wamid) where wamid is not null;

comment on column public.wa_usage_events.cost_brl_internal is 'SENSÍVEL — custo Meta. Loja não deve ler diretamente; usar RPC wa_usage_summary_for_store.';

alter table public.wa_usage_events enable row level security;

-- A loja PODE ler eventos próprios (para auditoria), mas o frontend deve usar a RPC para evitar custo Meta.
-- Custo Meta é numérico sem rótulo no schema; a proteção real está em garantir que UIs só usem a RPC.
create policy wa_usage_events_admin_all on public.wa_usage_events
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 6. wa_usage_daily (agregado para painel) ──────────────────────────────
create table if not exists public.wa_usage_daily (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null,
  usage_date date not null,
  category text not null,
  messages_count integer not null default 0,
  price_brl_total numeric(10,2) not null default 0,
  cost_brl_total numeric(10,4) not null default 0,    -- SENSÍVEL
  updated_at timestamptz not null default now()
);
create unique index if not exists wa_usage_daily_unique
  on public.wa_usage_daily(store_id, usage_date, category);

alter table public.wa_usage_daily enable row level security;

create policy wa_usage_daily_admin_all on public.wa_usage_daily
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ── 7. wa_alerts_log (idempotência de alertas) ────────────────────────────
create table if not exists public.wa_alerts_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null,
  cycle_start timestamptz not null,
  alert_type text not null check (alert_type in ('soft_limit','quota_exhausted','wallet_zero','hard_limit_suspended')),
  sent_at timestamptz not null default now()
);
create unique index if not exists wa_alerts_unique
  on public.wa_alerts_log(store_id, cycle_start, alert_type);

alter table public.wa_alerts_log enable row level security;

create policy wa_alerts_tenant_read on public.wa_alerts_log
  for select to authenticated
  using (public.auth_row_read_user_store(user_id, store_id));

create policy wa_alerts_admin_all on public.wa_alerts_log
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- RPCs
-- ============================================================================

-- Garante que a loja tem uma wallet (cria com defaults se não existir)
create or replace function public.wa_wallet_ensure(p_store_id uuid)
returns public.wa_wallets
language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.wa_wallets;
  v_user_id uuid;
begin
  select w.* into v_wallet from public.wa_wallets w where w.store_id = p_store_id;
  if found then return v_wallet; end if;

  select s.user_id into v_user_id from public.stores s where s.id = p_store_id;
  if v_user_id is null then raise exception 'store_not_found'; end if;

  insert into public.wa_wallets(store_id, user_id, included_quota, cycle_start, cycle_end)
  values (p_store_id, v_user_id, 0, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month')
  returning * into v_wallet;
  return v_wallet;
end $$;

grant execute on function public.wa_wallet_ensure(uuid) to authenticated, service_role;

-- Debita uma mensagem da carteira. Chamada pelo worker (service_role).
-- Retorna saldo restante e preço cobrado — NUNCA custo Meta.
create or replace function public.wa_wallet_charge(
  p_store_id uuid,
  p_scheduled_message_id uuid,
  p_category text,
  p_country text default 'BR'
)
returns table(
  ok boolean,
  reason text,
  source text,
  price_brl_charged numeric,
  remaining_quota integer,
  remaining_purchased integer,
  usage_event_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.wa_wallets;
  v_pricing public.wa_message_pricing;
  v_source text;
  v_event_id uuid;
  v_user_id uuid;
begin
  -- Lock da wallet
  select * into v_wallet from public.wa_wallets where store_id = p_store_id for update;
  if not found then
    -- auto-cria
    perform public.wa_wallet_ensure(p_store_id);
    select * into v_wallet from public.wa_wallets where store_id = p_store_id for update;
  end if;

  if v_wallet.status = 'suspended' then
    return query select false, 'wallet_suspended', null::text, 0::numeric, v_wallet.included_quota - v_wallet.used_in_cycle, v_wallet.purchased_balance, null::uuid;
    return;
  end if;

  -- Pricing ativo
  select * into v_pricing
  from public.wa_message_pricing
  where category = p_category and country = p_country and active = true
  order by effective_from desc
  limit 1;

  if not found then
    -- fallback: 0,00 (sem cobrança) para não bloquear envios em config incompleta
    v_pricing.cost_brl := 0;
    v_pricing.price_brl := 0;
  end if;

  -- Decide fonte: franquia primeiro, depois pacote
  if v_wallet.used_in_cycle < v_wallet.included_quota then
    v_source := 'included';
    update public.wa_wallets
      set used_in_cycle = used_in_cycle + 1, updated_at = now()
      where store_id = p_store_id;
  elsif v_wallet.purchased_balance > 0 then
    v_source := 'purchased';
    update public.wa_wallets
      set purchased_balance = purchased_balance - 1, updated_at = now()
      where store_id = p_store_id;
  else
    return query select false, 'insufficient_balance', null::text, 0::numeric, 0, 0, null::uuid;
    return;
  end if;

  -- Insere evento
  insert into public.wa_usage_events(
    store_id, user_id, scheduled_message_id, category, country,
    cost_brl_internal, price_brl_charged, source, status
  ) values (
    p_store_id, v_wallet.user_id, p_scheduled_message_id, p_category, p_country,
    v_pricing.cost_brl, v_pricing.price_brl, v_source, 'reserved'
  ) returning id into v_event_id;

  -- Atualiza agregado diário
  insert into public.wa_usage_daily(store_id, user_id, usage_date, category, messages_count, price_brl_total, cost_brl_total)
  values (p_store_id, v_wallet.user_id, current_date, p_category, 1, v_pricing.price_brl, v_pricing.cost_brl)
  on conflict (store_id, usage_date, category) do update
    set messages_count = wa_usage_daily.messages_count + 1,
        price_brl_total = wa_usage_daily.price_brl_total + excluded.price_brl_total,
        cost_brl_total = wa_usage_daily.cost_brl_total + excluded.cost_brl_total,
        updated_at = now();

  -- Re-lê saldo
  select * into v_wallet from public.wa_wallets where store_id = p_store_id;

  return query select
    true,
    null::text,
    v_source,
    v_pricing.price_brl,
    greatest(v_wallet.included_quota - v_wallet.used_in_cycle, 0),
    v_wallet.purchased_balance,
    v_event_id;
end $$;

grant execute on function public.wa_wallet_charge(uuid, uuid, text, text) to service_role;

-- Estorno (worker chama em falha permanente)
create or replace function public.wa_wallet_refund(p_usage_event_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_event public.wa_usage_events;
begin
  select * into v_event from public.wa_usage_events where id = p_usage_event_id for update;
  if not found or v_event.status in ('refunded','failed') then return false; end if;

  update public.wa_usage_events
    set status = 'refunded', refunded_at = now(), refund_reason = p_reason
    where id = p_usage_event_id;

  if v_event.source = 'included' then
    update public.wa_wallets set used_in_cycle = greatest(used_in_cycle - 1, 0), updated_at = now()
      where store_id = v_event.store_id;
  else
    update public.wa_wallets set purchased_balance = purchased_balance + 1, updated_at = now()
      where store_id = v_event.store_id;
  end if;

  -- Reverte agregado (não vai negativo)
  update public.wa_usage_daily
    set messages_count = greatest(messages_count - 1, 0),
        price_brl_total = greatest(price_brl_total - v_event.price_brl_charged, 0),
        cost_brl_total = greatest(cost_brl_total - v_event.cost_brl_internal, 0),
        updated_at = now()
    where store_id = v_event.store_id
      and usage_date = (v_event.charged_at at time zone 'UTC')::date
      and category = v_event.category;

  return true;
end $$;

grant execute on function public.wa_wallet_refund(uuid, text) to service_role;

-- Confirma evento (chamado pelo webhook Meta após delivered)
create or replace function public.wa_wallet_confirm(p_usage_event_id uuid, p_wamid text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.wa_usage_events
    set status = 'confirmed', confirmed_at = now(), wamid = coalesce(p_wamid, wamid)
    where id = p_usage_event_id and status = 'reserved';
  return found;
end $$;
grant execute on function public.wa_wallet_confirm(uuid, text) to service_role;

-- Resumo para a LOJA — sem custo Meta nem margem
create or replace function public.wa_usage_summary_for_store(p_store_id uuid, p_days integer default 30)
returns table(
  usage_date date,
  category text,
  messages_count integer,
  price_brl_total numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.auth_row_read_user_store(
    (select user_id from public.stores where id = p_store_id),
    p_store_id
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select d.usage_date, d.category, d.messages_count, d.price_brl_total
  from public.wa_usage_daily d
  where d.store_id = p_store_id
    and d.usage_date >= current_date - p_days
  order by d.usage_date desc, d.category;
end $$;

grant execute on function public.wa_usage_summary_for_store(uuid, integer) to authenticated;

-- Relatório de margem — SÓ ADMIN
create or replace function public.wa_admin_margin_report(p_period_start date, p_period_end date, p_store_id uuid default null)
returns table(
  store_id uuid,
  store_name text,
  messages_count bigint,
  price_brl_total numeric,
  cost_brl_total numeric,
  margin_brl numeric,
  margin_pct numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden: admin only';
  end if;

  return query
  select
    s.id,
    s.name,
    coalesce(sum(d.messages_count), 0)::bigint,
    coalesce(sum(d.price_brl_total), 0)::numeric,
    coalesce(sum(d.cost_brl_total), 0)::numeric,
    coalesce(sum(d.price_brl_total) - sum(d.cost_brl_total), 0)::numeric,
    case
      when coalesce(sum(d.price_brl_total), 0) > 0
      then round(((sum(d.price_brl_total) - sum(d.cost_brl_total)) / sum(d.price_brl_total)) * 100, 2)
      else 0
    end
  from public.stores s
  left join public.wa_usage_daily d
    on d.store_id = s.id
    and d.usage_date between p_period_start and p_period_end
  where p_store_id is null or s.id = p_store_id
  group by s.id, s.name
  having coalesce(sum(d.messages_count), 0) > 0 or p_store_id is not null
  order by margin_brl desc;
end $$;

grant execute on function public.wa_admin_margin_report(date, date, uuid) to authenticated;

-- Reset mensal de ciclo (cron)
create or replace function public.wa_wallet_reset_cycle()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.wa_wallets
    set used_in_cycle = 0,
        cycle_start = date_trunc('month', now()),
        cycle_end = date_trunc('month', now()) + interval '1 month',
        updated_at = now()
    where cycle_end <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.wa_wallet_reset_cycle() to service_role;

-- ============================================================================
-- Seeds: pricing inicial + pacotes
-- ============================================================================

insert into public.wa_message_pricing (category, country, cost_brl, price_brl, active)
values
  ('marketing',      'BR', 0.0700, 0.1200, true),
  ('utility',        'BR', 0.0200, 0.0400, true),
  ('authentication', 'BR', 0.0350, 0.0600, true),
  ('service',        'BR', 0.0000, 0.0000, true)
on conflict do nothing;

insert into public.wa_message_packs (sku, name, messages_count, price_brl, category, sort_order)
values
  ('pack_mkt_1k',  'Pacote 1.000 mensagens marketing',  1000,   97.00, 'marketing', 1),
  ('pack_mkt_5k',  'Pacote 5.000 mensagens marketing',  5000,  397.00, 'marketing', 2),
  ('pack_mkt_25k', 'Pacote 25.000 mensagens marketing', 25000, 1497.00, 'marketing', 3)
on conflict (sku) do nothing;
