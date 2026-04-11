-- Dashboard BFF: Single call snapshot function
-- Consolidates metrics from multiple tables for the Relatorios and Analytics pages

create or replace function get_dashboard_snapshot(p_store_id uuid, p_period_days int)
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
  v_result json;
begin
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
    where store_id = p_store_id and status != 'resolvido'
  ),
  unread_conversations as (
    select coalesce(sum(unread_count), 0) as total_unread
    from conversations
    where store_id = p_store_id
  ),
  prescriptions_summary as (
    select 
      count(*) filter (where status in ('aprovada', 'em_execucao', 'concluida')) as active_count,
      count(*) filter (where status = 'aguardando_aprovacao') as pending_count
    from prescriptions
    where store_id = p_store_id
  ),
  heatmap_data as (
    -- Grouping message_sends by day of week and 3 hour buckets
    -- Note: This depends on message_sends existing. If not, returns empty object.
    select 
      json_object_agg(dow || '-' || bucket, cnt) as cells,
      coalesce(max(cnt), 0) as max_val
    from (
      select 
        (extract(dow from created_at)::int + 6) % 7 as dow, -- 0=Mon, 6=Sun
        case 
          when extract(hour from created_at) < 11 then '08h'
          when extract(hour from created_at) < 15 then '12h'
          else '18h'
        end as bucket,
        count(*) as cnt
      from messages -- Using messages table as fallback if message_sends is not global
      where direction = 'outbound' 
        and created_at >= v_since
        and exists (
          select 1 from conversations c 
          where c.id = messages.conversation_id and c.store_id = p_store_id
        )
      group by 1, 2
    ) sub
  )
  
  select json_build_object(
    'analytics', (select row_to_json(analytics_summary.*) from analytics_summary),
    'prev_revenue', (select prev_revenue from prev_analytics),
    'rfm', (select row_to_json(rfm_summary.*) from rfm_summary),
    'opportunities', (select active_opportunities from opportunities_summary),
    'unread', (select total_unread from unread_conversations),
    'prescriptions', (select row_to_json(prescriptions_summary.*) from prescriptions_summary),
    'heatmap', (select row_to_json(heatmap_data.*) from heatmap_data),
    'timestamp', now()
  ) into v_result;

  return v_result;
end;
$$;
