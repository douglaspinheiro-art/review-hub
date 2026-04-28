-- Shadow-mode usage recorder: mede sem debitar saldo.
-- Insere wa_usage_events (status='confirmed', source='included', price=cost=0 para a loja)
-- e atualiza wa_usage_daily com price/cost reais (visíveis só para admin via RPC).

create or replace function public.wa_usage_record_shadow(
  p_store_id uuid,
  p_user_id uuid,
  p_scheduled_message_id uuid,
  p_wamid text,
  p_category text,
  p_country text default 'BR'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_price numeric(10,4) := 0;
  v_cost numeric(10,4) := 0;
begin
  -- Lookup pricing (não falha se ausente)
  select price_brl, cost_brl_internal
    into v_price, v_cost
    from public.wa_message_pricing
   where category = p_category
     and country = coalesce(p_country, 'BR')
   limit 1;

  v_price := coalesce(v_price, 0);
  v_cost  := coalesce(v_cost, 0);

  insert into public.wa_usage_events(
    store_id, user_id, scheduled_message_id, wamid,
    category, country, cost_brl_internal, price_brl_charged,
    source, status, charged_at, confirmed_at
  ) values (
    p_store_id, p_user_id, p_scheduled_message_id, p_wamid,
    p_category, coalesce(p_country, 'BR'), v_cost, v_price,
    'included', 'confirmed', now(), now()
  )
  returning id into v_event_id;

  -- Agregado diário (admin only)
  insert into public.wa_usage_daily(
    store_id, user_id, usage_date, category,
    messages_count, price_brl_total, cost_brl_total, updated_at
  ) values (
    p_store_id, p_user_id, current_date, p_category,
    1, v_price, v_cost, now()
  )
  on conflict (store_id, usage_date, category)
  do update set
    messages_count   = public.wa_usage_daily.messages_count + 1,
    price_brl_total  = public.wa_usage_daily.price_brl_total + excluded.price_brl_total,
    cost_brl_total   = public.wa_usage_daily.cost_brl_total + excluded.cost_brl_total,
    updated_at       = now();

  return v_event_id;
end;
$$;

revoke all on function public.wa_usage_record_shadow(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_usage_record_shadow(uuid, uuid, uuid, text, text, text) to service_role;

comment on function public.wa_usage_record_shadow is 'Shadow mode: registra uso WhatsApp sem debitar saldo. Apenas service_role.';