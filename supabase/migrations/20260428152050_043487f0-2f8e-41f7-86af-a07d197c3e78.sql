-- Tabela de feature flags (key/value JSON)
create table if not exists public.feature_flags (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.feature_flags enable row level security;

create policy feature_flags_read_all on public.feature_flags
  for select to authenticated using (true);

create policy feature_flags_admin_write on public.feature_flags
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

insert into public.feature_flags(key, value, description)
values ('wa_billing_enabled', 'false'::jsonb, 'Ativa cobrança real de mensagens WhatsApp; desligado = modo shadow')
on conflict (key) do nothing;

-- Credita um pacote pago na carteira (chamado pelo mercadopago-webhook).
create or replace function public.wa_wallet_credit_pack(
  p_store_id uuid,
  p_pack_id uuid,
  p_mp_payment_id text,
  p_mp_external_reference text default null
)
returns table(
  ok boolean,
  reason text,
  messages_credited integer,
  purchased_balance integer,
  purchase_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_pack public.wa_message_packs;
  v_existing public.wa_pack_purchases;
  v_user_id uuid;
  v_purchase_id uuid;
  v_balance integer;
  v_inserted integer;
begin
  select * into v_existing from public.wa_pack_purchases
    where mp_payment_id = p_mp_payment_id and status = 'paid'
    limit 1;
  if found then
    select purchased_balance into v_balance from public.wa_wallets where store_id = v_existing.store_id;
    return query select true, 'already_credited'::text, v_existing.messages_credited, coalesce(v_balance,0), v_existing.id;
    return;
  end if;

  select * into v_pack from public.wa_message_packs where id = p_pack_id and active = true;
  if not found then
    return query select false, 'pack_not_found'::text, 0, 0, null::uuid;
    return;
  end if;

  select user_id into v_user_id from public.stores where id = p_store_id;
  if v_user_id is null then
    return query select false, 'store_not_found'::text, 0, 0, null::uuid;
    return;
  end if;

  perform public.wa_wallet_ensure(p_store_id);

  insert into public.wa_pack_purchases(
    store_id, user_id, pack_id, messages_credited, price_brl,
    status, mp_payment_id, mp_external_reference, paid_at, credited_at
  ) values (
    p_store_id, v_user_id, p_pack_id, v_pack.messages_count, v_pack.price_brl,
    'paid', p_mp_payment_id, p_mp_external_reference, now(), now()
  ) returning id into v_purchase_id;

  update public.wa_wallets
    set purchased_balance = purchased_balance + v_pack.messages_count,
        status = case when status = 'suspended' and suspended_reason = 'wallet_zero' then 'active' else status end,
        suspended_reason = case when status = 'suspended' and suspended_reason = 'wallet_zero' then null else suspended_reason end,
        updated_at = now()
    where store_id = p_store_id
    returning purchased_balance into v_balance;

  return query select true, null::text, v_pack.messages_count, v_balance, v_purchase_id;
end $$;

grant execute on function public.wa_wallet_credit_pack(uuid, uuid, text, text) to service_role;

-- Registra alerta idempotente por ciclo. true = inseriu (deve enviar), false = já existia.
create or replace function public.wa_alert_register(
  p_store_id uuid,
  p_alert_type text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.wa_wallets;
  v_inserted integer := 0;
begin
  select * into v_wallet from public.wa_wallets where store_id = p_store_id;
  if not found then return false; end if;

  insert into public.wa_alerts_log(store_id, user_id, cycle_start, alert_type)
  values (p_store_id, v_wallet.user_id, v_wallet.cycle_start, p_alert_type)
  on conflict (store_id, cycle_start, alert_type) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end $$;

grant execute on function public.wa_alert_register(uuid, text) to service_role;

-- Admin liga/desliga cobrança real
create or replace function public.wa_billing_set_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden: admin only';
  end if;

  insert into public.feature_flags(key, value, updated_at, updated_by)
  values ('wa_billing_enabled', to_jsonb(p_enabled), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'wa_billing_toggle', 'feature_flag', 'wa_billing_enabled',
          jsonb_build_object('enabled', p_enabled));

  return p_enabled;
end $$;

grant execute on function public.wa_billing_set_enabled(boolean) to authenticated;
