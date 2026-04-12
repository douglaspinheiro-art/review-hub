-- Atomic distributed rate limit using a transaction-level advisory lock.
-- Eliminates the TOCTOU race condition in the prior read-then-insert pattern
-- (two concurrent requests could both read count=N and both be allowed through).
--
-- The advisory lock serializes all requests with the same rate_key at the DB level.
-- pg_advisory_xact_lock is released automatically at end of transaction.

create or replace function public.check_rate_limit_atomic(
  p_key       text,
  p_max       int,
  p_window_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start  timestamptz;
  current_count bigint;
  lock_id       bigint;
begin
  -- Derive a stable advisory lock key from the rate_key string.
  -- hashtext returns int4; cast to bigint and take abs to ensure positive.
  lock_id := abs(hashtext(p_key)::bigint);

  -- Acquire a transaction-level advisory lock for this key.
  -- Concurrent requests for the same key will queue here, serialising the
  -- count-check → insert sequence and preventing double-counting.
  perform pg_advisory_xact_lock(lock_id);

  window_start := now() - (p_window_ms::numeric / 1000.0 * interval '1 second');

  select count(*)
    into current_count
    from public.api_request_logs
   where rate_key = p_key
     and created_at >= window_start;

  if current_count >= p_max then
    return false;
  end if;

  insert into public.api_request_logs (rate_key)
  values (p_key);

  return true;
end;
$$;

comment on function public.check_rate_limit_atomic(text, int, bigint) is
  'Atomic rate limit check — serialises concurrent requests via advisory lock, eliminating TOCTOU race. Called from Edge Functions via supabase.rpc(). p_window_ms is the window size in milliseconds (e.g. 86400000 for 24h).';

-- Only service_role may call this; Edge Functions use the service role key.
revoke all on function public.check_rate_limit_atomic(text, int, bigint) from public;
grant execute on function public.check_rate_limit_atomic(text, int, bigint) to service_role;
