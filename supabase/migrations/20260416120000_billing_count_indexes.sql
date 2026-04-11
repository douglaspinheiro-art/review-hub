-- Índices para contagens de uso em faturação (message_sends por mês, customers_v3 por tenant)
-- quando store_id falha ou em contas só com user_id.
-- message_sends: esquemas antigos usam sent_at; outros têm created_at.

do $body$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_sends' and column_name = 'created_at'
  ) then
    execute $sql$
      create index if not exists idx_message_sends_user_created_at
        on public.message_sends (user_id, created_at desc)
    $sql$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_sends' and column_name = 'sent_at'
  ) then
    execute $sql$
      create index if not exists idx_message_sends_user_sent_at
        on public.message_sends (user_id, sent_at desc)
    $sql$;
  end if;
end
$body$;

do $body$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers_v3' and column_name = 'user_id'
  ) then
    execute $sql$
      create index if not exists idx_customers_v3_user_id
        on public.customers_v3 (user_id)
    $sql$;
  end if;
end
$body$;
