-- Atomic distributed rate limit using a transaction-level advisory lock.
-- Eliminates the TOCTOU race condition in the prior read-then-insert pattern
-- (two concurrent requests could both read count=N and both be allowed through).
--
-- The advisory lock serializes all requests with the same rate_key at the DB level.
-- pg_advisory_xact_lock is released automatically at end of transaction.
--
-- Apenas CREATE neste ficheiro: o CLI do Supabase pode rejeitar várias instruções
-- no mesmo ficheiro de migração ("cannot insert multiple commands into a prepared statement").

create or replace function public.check_rate_limit_atomic(
  p_key       text,
  p_max       int,
  p_window_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  window_start  timestamptz;
  current_count bigint;
  lock_id       bigint;
begin
  lock_id := abs(hashtext(p_key)::bigint);

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
$fn$;
