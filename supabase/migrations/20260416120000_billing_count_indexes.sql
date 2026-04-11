-- Índices para contagens de uso em faturação (message_sends por mês, customers_v3 por tenant)
-- quando store_id falha ou em contas só com user_id.

create index if not exists idx_message_sends_user_created_at
  on public.message_sends (user_id, created_at desc);

create index if not exists idx_customers_v3_user_id
  on public.customers_v3 (user_id);
