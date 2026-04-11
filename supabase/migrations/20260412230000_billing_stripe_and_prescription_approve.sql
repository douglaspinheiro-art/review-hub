-- Stripe customer reference + solicitações de cancelamento + RPC atômico prescrição → campanha rascunho

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create table if not exists public.billing_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.billing_cancellation_requests enable row level security;

drop policy if exists billing_cancel_insert_own on public.billing_cancellation_requests;
create policy billing_cancel_insert_own on public.billing_cancellation_requests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists billing_cancel_select_own on public.billing_cancellation_requests;
create policy billing_cancel_select_own on public.billing_cancellation_requests
  for select to authenticated
  using (user_id = auth.uid());

grant select, insert on public.billing_cancellation_requests to authenticated;

-- Aprovação atômica: cria campanha em rascunho e marca prescrição em execução.
create or replace function public.approve_prescription_campaign_draft(
  p_prescription_id uuid,
  p_campaign_name text,
  p_message text,
  p_channel text,
  p_email_rfm text,
  p_email_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_store uuid;
  v_cid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select pr.user_id, pr.store_id
  into v_uid, v_store
  from prescriptions pr
  where pr.id = p_prescription_id;

  if v_store is null then
    raise exception 'prescription not found';
  end if;

  if not exists (
    select 1
    from stores s
    where s.id = v_store
      and (
        s.user_id = auth.uid()
        or exists (
          select 1
          from team_members tm
          where tm.account_owner_id = s.user_id
            and tm.invited_user_id = auth.uid()
            and tm.status = 'active'
        )
      )
  ) then
    raise exception 'forbidden';
  end if;

  insert into campaigns (
    user_id,
    store_id,
    name,
    message,
    channel,
    status,
    source_prescription_id,
    email_recipient_rfm,
    email_recipient_mode
  )
  values (
    v_uid,
    v_store,
    coalesce(nullif(trim(p_campaign_name), ''), 'Campanha da prescrição'),
    coalesce(p_message, ''),
    coalesce(nullif(trim(p_channel), ''), 'whatsapp'),
    'draft',
    p_prescription_id,
    nullif(trim(p_email_rfm), ''),
    nullif(trim(p_email_mode), '')
  )
  returning id into v_cid;

  update prescriptions
  set status = 'em_execucao'
  where id = p_prescription_id and store_id = v_store;

  return v_cid;
end;
$$;

grant execute on function public.approve_prescription_campaign_draft(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.approve_prescription_campaign_draft(uuid, text, text, text, text, text) to service_role;
