-- Forecast RPC: Statistical projection calculated on the server
-- Replaces client-side math for better scalability and consistency

create or replace function calculate_forecast_projection(p_store_id uuid, p_period_days int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_count int;
  v_total_revenue numeric;
  v_avg_daily numeric;
  v_mid int;
  v_prev_half_revenue numeric;
  v_recent_half_revenue numeric;
  v_growth_pct numeric;
  v_damped_pct numeric;
  v_projected_30 numeric;
begin
  -- 1. Aggregates for the full window
  select 
    count(*),
    coalesce(sum(revenue_influenced), 0)
  into v_rows_count, v_total_revenue
  from analytics_daily
  where store_id = p_store_id and date >= (now() - (p_period_days || ' days')::interval)::date;

  if v_rows_count = 0 then
    return json_build_object(
      'projected_30', 0,
      'trend_pct', 0,
      'avg_daily', 0,
      'total_realized', 0,
      'days_count', 0
    );
  end if;

  v_avg_daily := v_total_revenue / v_rows_count;
  v_mid := v_rows_count / 2;

  -- 2. Calculate halves for trend analysis
  with sorted_rows as (
    select revenue_influenced, row_number() over (order by date asc) as rn
    from analytics_daily
    where store_id = p_store_id and date >= (now() - (p_period_days || ' days')::interval)::date
  )
  select 
    coalesce(sum(revenue_influenced) filter (where rn <= v_mid), 0),
    coalesce(sum(revenue_influenced) filter (where rn > v_mid), 0)
  into v_prev_half_revenue, v_recent_half_revenue
  from sorted_rows;

  -- 3. Trend math (amortized at 35% and capped at +/- 25%)
  if v_prev_half_revenue > 0 then
    v_growth_pct := ((v_recent_half_revenue - v_prev_half_revenue) / v_prev_half_revenue) * 100;
  else
    v_growth_pct := 0;
  end if;

  v_damped_pct := least(25, greatest(-25, v_growth_pct * 0.35));
  v_projected_30 := v_avg_daily * 30 * (1 + v_damped_pct / 100);

  return json_build_object(
    'projected_30', greatest(0, v_projected_30),
    'trend_pct', v_growth_pct,
    'avg_daily', v_avg_daily,
    'total_realized', v_total_revenue,
    'days_count', v_rows_count,
    'calculated_at', now()
  );
end;
$$;
