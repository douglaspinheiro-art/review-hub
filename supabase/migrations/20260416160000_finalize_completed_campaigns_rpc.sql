-- Finaliza campanhas em `running` quando não há mais entregas pendentes (evita N×2 counts no worker).

create or replace function public.finalize_completed_campaigns()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n int := 0;
begin
  update public.campaigns c
  set status = 'completed', updated_at = now()
  from (
    select c0.id
    from public.campaigns c0
    where c0.status = 'running'
      and not exists (
        select 1
        from public.scheduled_messages sm
        where sm.campaign_id = c0.id
          and sm.status in ('pending', 'processing')
      )
      and not exists (
        select 1
        from public.newsletter_send_recipients r
        where r.campaign_id = c0.id
          and r.status in ('pending', 'processing')
      )
  ) d
  where c.id = d.id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.finalize_completed_campaigns() from public;
grant execute on function public.finalize_completed_campaigns() to authenticated;
grant execute on function public.finalize_completed_campaigns() to service_role;
