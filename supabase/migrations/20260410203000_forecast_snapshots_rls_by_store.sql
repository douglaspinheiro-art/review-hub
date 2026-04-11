-- forecast_snapshots: alinhar RLS ao modelo da app (stores.store_id + stores.user_id).
-- A migração 20260407193000 usava user_id na própria tabela; os tipos do frontend usam store_id.
do $$
begin
  if to_regclass('public.forecast_snapshots') is null then
    return;
  end if;

  execute 'alter table public.forecast_snapshots enable row level security';

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'forecast_snapshots' and column_name = 'store_id'
  ) then
    execute 'drop policy if exists forecast_snapshots_own on public.forecast_snapshots';
    execute $p$
      create policy forecast_snapshots_own on public.forecast_snapshots
      for all
      using (
        store_id is not null
        and exists (
          select 1 from public.stores s
          where s.id = forecast_snapshots.store_id and s.user_id = auth.uid()
        )
      )
      with check (
        store_id is not null
        and exists (
          select 1 from public.stores s
          where s.id = forecast_snapshots.store_id and s.user_id = auth.uid()
        )
      )
    $p$;
  end if;
end $$;
