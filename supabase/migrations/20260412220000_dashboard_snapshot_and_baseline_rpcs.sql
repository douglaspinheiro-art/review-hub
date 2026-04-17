-- Extend get_dashboard_snapshot with home KPIs + chart series (single round-trip).
-- Add get_conversion_baseline_summary for server-side aggregates (replaces full-table client scans).

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
        (extract(dow from m.created_at)::int + 6) % 7 as dow,
        case
          when extract(hour from m.created_at) < 11 then '08h'
          when extract(hour from m.created_at) < 15 then '12h'
          else '18h'
        end as bucket,
        count(*) as cnt
      from messages m
      where m.direction = 'outbound'
        and m.created_at >= v_since
        and exists (
          select 1 from conversations c
          where c.id = m.conversation_id and c.store_id = p_store_id
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
    'timestamp', now()
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_dashboard_snapshot(uuid, int) to authenticated;
grant execute on function public.get_dashboard_snapshot(uuid, int) to service_role;

-- Aggregated conversion baseline (no row-by-row fetch to the browser).
create or replace function public.get_conversion_baseline_summary(p_store_id uuid, p_period_days int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - (p_period_days || ' days')::interval;
  v_prev_start timestamptz := now() - (p_period_days * 2 || ' days')::interval;
  v_prev_end timestamptz := now() - (p_period_days || ' days')::interval;
  v_owner uuid;
begin
  select s.user_id into v_owner from stores s where s.id = p_store_id limit 1;
  if v_owner is null then
    raise exception 'store not found';
  end if;

  return (
    with
    sends_cur as (
      select status
      from message_sends ms
      where (
          ms.store_id = p_store_id
          or (ms.store_id is null and ms.user_id = v_owner)
        )
        and ms.sent_at >= v_since
    ),
    sends_prev as (
      select status
      from message_sends ms
      where (
          ms.store_id = p_store_id
          or (ms.store_id is null and ms.user_id = v_owner)
        )
        and ms.sent_at >= v_prev_start
        and ms.sent_at < v_prev_end
    ),
    conv as (
      select id, sla_due_at, last_message_at, priority, status
      from conversations
      where store_id = p_store_id
    ),
    attr as (
      select ae.order_value, ae.attributed_campaign_id
      from attribution_events ae
      inner join campaigns c on c.id = ae.attributed_campaign_id and c.store_id = p_store_id
      where ae.order_date >= v_since
    ),
    agg as (
      select
        (select count(*) from sends_cur where coalesce(status, '') like 'sent%') as sent,
        (select count(*) from sends_cur where status = 'replied') as replied,
        (select count(*) from sends_cur where status = 'delivered') as delivered,
        (select count(*) from sends_cur where status = 'read') as read,
        (select count(*) from sends_prev where coalesce(status, '') like 'sent%') as prev_sent,
        (select count(*) from sends_prev where status = 'replied') as prev_replied,
        (select count(*) from attr) as conversions,
        (select coalesce(sum(order_value::numeric), 0) from attr) as revenue
    ),
    sla_calc as (
      select
        count(*) filter (where sla_due_at is not null) as tracked,
        count(*) filter (
          where sla_due_at is not null
            and sla_due_at::timestamptz < now()
        ) as breached
      from conv
    ),
    pri as (
      select
        count(*) filter (where coalesce(priority, 'normal') = 'urgent') as urgent,
        count(*) filter (where coalesce(priority, 'normal') = 'high') as high,
        count(*) filter (where coalesce(priority, 'normal') = 'normal') as normal,
        count(*) filter (where coalesce(priority, 'normal') = 'low') as low
      from conv
    )
    select json_build_object(
      'sent', a.sent,
      'replied', a.replied,
      'delivered', a.delivered,
      'read', a.read,
      'conversions', a.conversions,
      'revenue', a.revenue,
      'prev_sent', a.prev_sent,
      'prev_replied', a.prev_replied,
      'sla_tracked', s.tracked,
      'sla_breached', s.breached,
      'priority_urgent', p.urgent,
      'priority_high', p.high,
      'priority_normal', p.normal,
      'priority_low', p.low
    )
    from agg a
    cross join sla_calc s
    cross join pri p
  );
end;
$$;

grant execute on function public.get_conversion_baseline_summary(uuid, int) to authenticated;
grant execute on function public.get_conversion_baseline_summary(uuid, int) to service_role;
