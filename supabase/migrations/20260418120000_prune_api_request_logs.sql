-- Retenção de `api_request_logs` (rate limit distribuído): função para prune periódico (cron / SQL Editor).

create or replace function public.prune_api_request_logs(p_retention_days int default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted bigint;
begin
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 365 then
    raise exception 'p_retention_days must be between 1 and 365';
  end if;

  delete from public.api_request_logs
  where created_at < (now() - (p_retention_days || ' days')::interval);

  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

comment on function public.prune_api_request_logs(int) is
  'Apaga linhas de api_request_logs mais antigas que p_retention_days. Executar com service_role (ex.: pg_cron, job externo).';

revoke all on function public.prune_api_request_logs(int) from public;
grant execute on function public.prune_api_request_logs(int) to service_role;
