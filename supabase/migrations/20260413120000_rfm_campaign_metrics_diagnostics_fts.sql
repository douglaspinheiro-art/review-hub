-- RFM counts + campaign send/attribution aggregates (evita full-scan no browser)
-- FTS na pesquisa de inbox + RLS em diagnostics + snapshot com pedidos/receita atribuídos

-- ── Extensions (Supabase: geralmente permitido) ─────────────────────────────
create extension if not exists pg_trgm;

-- ── Trgm em customers_v3 (ilike OR nome/email/telefone) ─────────────────────
create index if not exists idx_customers_v3_name_trgm
  on public.customers_v3 using gin (name gin_trgm_ops);
create index if not exists idx_customers_v3_email_trgm
  on public.customers_v3 using gin (email gin_trgm_ops) where email is not null;
create index if not exists idx_customers_v3_phone_trgm
  on public.customers_v3 using gin (phone gin_trgm_ops) where phone is not null;

-- ── GIN FTS em messages (conteúdo da conversa) ───────────────────────────────
create index if not exists idx_messages_content_fts
  on public.messages using gin (to_tsvector('portuguese', coalesce(content, '')));

-- ── RFM: contagens no servidor (alinha aliases com rfm-segments.ts) ───────────
create or replace function public.get_rfm_report_counts(p_store_id uuid, p_owner_user_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select lower(trim(coalesce(c.rfm_segment, ''))) as seg,
      c.customer_health_score as chs
    from public.customers_v3 c
    where (p_store_id is not null and c.store_id = p_store_id)
       or (p_store_id is null and c.user_id = p_owner_user_id)
  ),
  tagged as (
    select
      seg,
      chs,
      case
        when seg in ('champions', 'campeao', 'campiao') then 'champions'
        when seg in ('loyal', 'loyal_customers', 'fiel') then 'loyal'
        when seg in ('at_risk', 'cant_lose', 'em_risco') then 'at_risk'
        when seg in ('lost', 'hibernating', 'perdido') then 'lost'
        when seg in ('new', 'new_customers', 'novo', 'promising', 'promissor') then 'new'
        else null
      end as bucket
    from base
  )
  select json_build_object(
    'champions', count(*) filter (where bucket = 'champions'),
    'loyal', count(*) filter (where bucket = 'loyal'),
    'at_risk', count(*) filter (where bucket = 'at_risk'),
    'lost', count(*) filter (where bucket = 'lost'),
    'new', count(*) filter (where bucket = 'new'),
    'other', count(*) filter (where bucket is null and seg <> ''),
    'total', count(*),
    'avg_chs',
      case
        when count(*) filter (where chs is not null) > 0
        then round(avg(chs) filter (where chs is not null))::int
        else null
      end
  )
  from tagged;
$$;

revoke all on function public.get_rfm_report_counts(uuid, uuid) from public;
grant execute on function public.get_rfm_report_counts(uuid, uuid) to authenticated;
grant execute on function public.get_rfm_report_counts(uuid, uuid) to service_role;

-- ── Campanhas: agregados message_sends + attribution por lista de IDs ───────
create or replace function public.get_campaign_metrics_bundle(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_campaign_ids uuid[]
)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v json;
begin
  if p_campaign_ids is null or cardinality(p_campaign_ids) = 0 then
    return '{"sends":[],"revenue":[]}'::json;
  end if;

  with send_agg as (
    select
      ms.campaign_id,
      count(*) filter (where ms.status = 'holdout')::bigint as holdout,
      count(*) filter (where coalesce(ms.status, '') like 'sent%')::bigint as sent_n,
      count(*) filter (where ms.status = 'suppressed_opt_out')::bigint as suppressed_opt_out,
      count(*) filter (where ms.status = 'suppressed_cooldown')::bigint as suppressed_cooldown
    from public.message_sends ms
    where ms.campaign_id = any(p_campaign_ids)
      and (
        (p_store_id is not null and ms.store_id = p_store_id)
        or (p_store_id is null and ms.user_id = p_owner_user_id)
      )
    group by ms.campaign_id
  ),
  rev_agg as (
    select
      ae.attributed_campaign_id as campaign_id,
      coalesce(sum(ae.order_value::numeric), 0)::numeric as revenue
    from public.attribution_events ae
    where ae.attributed_campaign_id = any(p_campaign_ids)
      and ae.user_id = p_owner_user_id
    group by ae.attributed_campaign_id
  )
  select json_build_object(
    'sends', coalesce(
      (
        select json_agg(
          json_build_object(
            'campaign_id', s.campaign_id,
            'holdout', s.holdout,
            'sent_n', s.sent_n,
            'suppressed_opt_out', s.suppressed_opt_out,
            'suppressed_cooldown', s.suppressed_cooldown
          )
        )
        from send_agg s
      ),
      '[]'::json
    ),
    'revenue', coalesce(
      (
        select json_agg(
          json_build_object('campaign_id', r.campaign_id, 'revenue', r.revenue)
        )
        from rev_agg r
      ),
      '[]'::json
    )
  )
  into v;

  return coalesce(v, '{"sends":[],"revenue":[]}'::json);
end;
$$;

revoke all on function public.get_campaign_metrics_bundle(uuid, uuid, uuid[]) from public;
grant execute on function public.get_campaign_metrics_bundle(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.get_campaign_metrics_bundle(uuid, uuid, uuid[]) to service_role;

-- ── Pesquisa inbox: FTS em vez de position(lower(...)) ───────────────────────
create or replace function public.search_conversation_ids_by_message(p_search text)
returns table (conversation_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct m.conversation_id
  from public.messages m
  inner join public.conversations c on c.id = m.conversation_id
  inner join public.contacts ct on c.contact_id = ct.id
  where public.auth_row_read_user_store(ct.user_id, ct.store_id)
    and length(trim(coalesce(p_search, ''))) >= 2
    and to_tsvector('portuguese', coalesce(m.content, ''))
      @@ plainto_tsquery('portuguese', trim(p_search))
  limit 400;
$$;

revoke all on function public.search_conversation_ids_by_message(text) from public;
grant execute on function public.search_conversation_ids_by_message(text) to authenticated;

-- ── diagnostics: RLS alinhada à loja / equipa ───────────────────────────────
do $diag$
begin
  if to_regclass('public.diagnostics') is not null then
    alter table public.diagnostics enable row level security;

    drop policy if exists diagnostics_tenant on public.diagnostics;
    create policy diagnostics_tenant on public.diagnostics
      for all to authenticated
      using (public.auth_row_read_user_store(user_id, store_id))
      with check (public.auth_row_write_user_store(user_id, store_id));
  end if;
end
$diag$;

-- ── Snapshot: heatmap via message_sends + métricas de atribuição explícitas ─
create or replace function public.get_dashboard_snapshot(p_store_id uuid, p_period_days int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_prev_since timestamptz;
  v_since_date date;
  v_prev_since_date date;
  v_owner uuid;
  v_result json;
begin
  select s.user_id into v_owner from stores s where s.id = p_store_id limit 1;
  if v_owner is null then
    raise exception 'store not found';
  end if;

  v_since := now() - (p_period_days || ' days')::interval;
  v_prev_since := now() - (p_period_days * 2 || ' days')::interval;
  v_since_date := v_since::date;
  v_prev_since_date := v_prev_since::date;

  with
  analytics_summary as (
    select
      coalesce(sum(revenue_influenced), 0) as total_revenue,
      coalesce(sum(messages_sent), 0) as total_sent,
      coalesce(sum(messages_delivered), 0) as total_delivered,
      coalesce(sum(messages_read), 0) as total_read,
      coalesce(sum(new_contacts), 0) as total_new_contacts
    from analytics_daily
    where store_id = p_store_id and date >= v_since_date
  ),
  prev_analytics as (
    select coalesce(sum(revenue_influenced), 0) as prev_revenue
    from analytics_daily
    where store_id = p_store_id and date >= v_prev_since_date and date < v_since_date
  ),
  rfm_summary as (
    select
      count(*) filter (where rfm_segment in ('champions', 'Campeões')) as champions,
      count(*) filter (where rfm_segment in ('loyal', 'Fiéis')) as loyal,
      count(*) filter (where rfm_segment in ('at_risk', 'Em risco')) as at_risk,
      count(*) filter (where rfm_segment in ('lost', 'Perdidos')) as lost,
      count(*) filter (where rfm_segment in ('new', 'Novos')) as new,
      count(*) as total_customers,
      coalesce(avg(customer_health_score), 0) as avg_chs
    from customers_v3
    where store_id = p_store_id
  ),
  opportunities_summary as (
    select count(*) as active_opportunities
    from opportunities
    where store_id = p_store_id and coalesce(status, '') not in ('resolvido', 'ignorado')
  ),
  unread_conversations as (
    select coalesce(sum(unread_count), 0) as total_unread
    from conversations
    where store_id = p_store_id
  ),
  open_conversations_ct as (
    select count(*)::int as open_count
    from conversations
    where store_id = p_store_id and coalesce(status, '') = 'open'
  ),
  prescriptions_summary as (
    select
      count(*) filter (where status in ('aprovada', 'em_execucao', 'concluida')) as active_count,
      count(*) filter (where status = 'aguardando_aprovacao') as pending_count
    from prescriptions
    where store_id = p_store_id
  ),
  heatmap_data as (
    select
      coalesce(json_object_agg(dow || '-' || bucket, cnt), '{}'::json) as cells,
      coalesce(max(cnt), 0) as max_val
    from (
      select
        (extract(dow from coalesce(ms.sent_at, ms.created_at))::int + 6) % 7 as dow,
        case
          when extract(hour from coalesce(ms.sent_at, ms.created_at)) < 11 then '08h'
          when extract(hour from coalesce(ms.sent_at, ms.created_at)) < 15 then '12h'
          else '18h'
        end as bucket,
        count(*)::bigint as cnt
      from message_sends ms
      where coalesce(ms.sent_at, ms.created_at) >= v_since
        and (
          ms.store_id = p_store_id
          or (ms.store_id is null and ms.user_id = v_owner)
        )
      group by 1, 2
    ) sub
  ),
  chart_series as (
    select coalesce(
      (
        select json_agg(row_json order by sort_date)
        from (
          select
            d.date as sort_date,
            json_build_object(
              'date', d.date,
              'messages_sent', d.messages_sent,
              'messages_delivered', d.messages_delivered,
              'messages_read', d.messages_read,
              'revenue_influenced', d.revenue_influenced,
              'new_contacts', d.new_contacts
            ) as row_json
          from analytics_daily d
          where d.store_id = p_store_id and d.date >= v_since_date
          order by d.date asc
        ) ordered_rows
      ),
      '[]'::json
    ) as series
  ),
  opp_revenue as (
    select coalesce(sum(estimated_impact), 0)::numeric as total
    from opportunities
    where store_id = p_store_id
      and coalesce(status, '') not in ('resolvido', 'ignorado')
  ),
  ideal_purchase as (
    select count(*)::int as n
    from customers_v3
    where store_id = p_store_id
      and rfm_segment in ('champions', 'Campeões', 'loyal', 'Fiéis')
  ),
  ms_agg as (
    select
      count(*) filter (where coalesce(ms.status, '') like 'sent%') as sent_n,
      count(*) filter (where ms.status = 'read') as read_n
    from message_sends ms
    where coalesce(ms.created_at, ms.sent_at) >= v_since
      and (
        ms.store_id = p_store_id
        or (ms.store_id is null and ms.user_id = v_owner)
      )
  ),
  attr_conv as (
    select count(*)::int as conv_n
    from attribution_events ae
    inner join campaigns c on c.id = ae.attributed_campaign_id and c.store_id = p_store_id
    where ae.order_date >= v_since
  ),
  attr_rev as (
    select coalesce(sum(ae.order_value::numeric), 0)::numeric as rev_total
    from attribution_events ae
    inner join campaigns c on c.id = ae.attributed_campaign_id and c.store_id = p_store_id
    where ae.order_date >= v_since
  ),
  rev_growth as (
    select
      case
        when pa.prev_revenue > 0 then round(100.0 * (an.total_revenue - pa.prev_revenue) / pa.prev_revenue)
        else 0
      end::int as pct
    from analytics_summary an, prev_analytics pa
  ),
  read_rate as (
    select
      case
        when an.total_sent > 0 then round(100.0 * an.total_read / an.total_sent)
        else 0
      end::int as pct
    from analytics_summary an
  ),
  msg_conversion as (
    select
      case
        when m.sent_n > 0 then round(100.0 * a.conv_n::numeric / m.sent_n, 2)
        else 0::numeric
      end as pct
    from ms_agg m, attr_conv a
  ),
  chs_parts as (
    select
      r.champions,
      r.loyal,
      r.new,
      r.at_risk,
      greatest(r.total_customers, 1) as tc
    from rfm_summary r
  ),
  chs_breakdown as (
    select json_build_object(
      'conversao', round(100.0 * champions / tc)::int,
      'funil', round(100.0 * loyal / tc)::int,
      'produtos', round(100.0 * new / tc)::int,
      'mobile', greatest(0, 100 - round(100.0 * champions / tc) - round(100.0 * loyal / tc) - round(100.0 * new / tc))
    ) as jb
    from chs_parts
  )
  select json_build_object(
    'analytics', (select row_to_json(analytics_summary.*) from analytics_summary),
    'prev_revenue', (select prev_revenue from prev_analytics),
    'rfm', (select row_to_json(rfm_summary.*) from rfm_summary),
    'opportunities', (select active_opportunities from opportunities_summary),
    'unread', (select total_unread from unread_conversations),
    'prescriptions', (select row_to_json(prescriptions_summary.*) from prescriptions_summary),
    'heatmap', (select row_to_json(heatmap_data.*) from heatmap_data),
    'open_conversations', (select open_count from open_conversations_ct),
    'rev_growth_pct', (select pct from rev_growth),
    'avg_read_rate_pct', (select pct from read_rate),
    'messaging_order_conversion_pct', (select pct from msg_conversion),
    'ideal_purchase_count', (select n from ideal_purchase),
    'estimated_opportunity_revenue', (select total from opp_revenue),
    'chs_breakdown', (select jb from chs_breakdown),
    'chart_series', (select series from chart_series),
    'attributed_order_count', (select conv_n from attr_conv),
    'attributed_order_revenue', (select rev_total from attr_rev),
    'timestamp', now()
  ) into v_result;

  return v_result;
end;
$$;
