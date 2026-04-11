-- Uma linha de config por loja (upsert onConflict store_id no dashboard).
with keeper as (
  select distinct on (store_id) id
  from public.ai_agent_config
  where store_id is not null
  order by store_id, updated_at desc nulls last, id desc
)
delete from public.ai_agent_config a
where a.store_id is not null
  and not exists (select 1 from keeper k where k.id = a.id);

create unique index if not exists ai_agent_config_store_id_key
  on public.ai_agent_config (store_id)
  where store_id is not null;
