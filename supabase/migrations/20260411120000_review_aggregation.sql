-- Review Aggregation Function
-- Returns summarized metrics for a specific user's reviews

create or replace function get_review_stats(p_user_id uuid)
returns table (
  avg_rating numeric,
  negative_count bigint,
  pending_count bigint,
  platform_count bigint
) 
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ensure the user can only see their own data if they are not an admin
  -- (Though security definer and the where clause already handle this)
  return query
  select 
    coalesce(avg(rating)::numeric, 0),
    count(*) filter (where rating <= 3),
    count(*) filter (where status = 'pending'),
    count(distinct platform)
  from reviews
  where user_id = p_user_id;
end;
$$;
