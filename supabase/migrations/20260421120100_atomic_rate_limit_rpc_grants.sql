-- Comentário e privilégios (instrução única via DO para compatibilidade com db push).

do $m$
begin
  execute
    'comment on function public.check_rate_limit_atomic(text, int, bigint) is ' ||
    quote_literal(
      'Atomic rate limit check — serialises concurrent requests via advisory lock, eliminating TOCTOU race. Called from Edge Functions via supabase.rpc(). p_window_ms is the window size in milliseconds (e.g. 86400000 for 24h).'
    );
  execute 'revoke all on function public.check_rate_limit_atomic(text, int, bigint) from public';
  execute 'grant execute on function public.check_rate_limit_atomic(text, int, bigint) to service_role';
end;
$m$;
