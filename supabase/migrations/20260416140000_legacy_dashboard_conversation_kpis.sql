-- Agregados de inbox para o fallback legado do dashboard (evita SELECT de todas as conversas no browser).
-- security invoker: aplica RLS de `conversations` como nas queries directas.

create or replace function public.get_legacy_dashboard_conversation_kpis(
  p_store_id uuid,
  p_user_id uuid
)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'open_count',
      coalesce((
        select count(*)::int
        from public.conversations c
        where (
          p_store_id is not null
          and c.store_id = p_store_id
        )
        or (
          p_store_id is null
          and p_user_id is not null
          and c.user_id = p_user_id
        )
      ), 0),
    'unread_sum',
      coalesce((
        select sum(coalesce(c.unread_count, 0))::bigint
        from public.conversations c
        where (
          p_store_id is not null
          and c.store_id = p_store_id
        )
        or (
          p_store_id is null
          and p_user_id is not null
          and c.user_id = p_user_id
        )
      ), 0)
  );
$$;

revoke all on function public.get_legacy_dashboard_conversation_kpis(uuid, uuid) from public;
grant execute on function public.get_legacy_dashboard_conversation_kpis(uuid, uuid) to authenticated;
