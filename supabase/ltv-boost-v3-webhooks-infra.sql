-- 🚀 INFRAESTRUTURA DE WEBHOOKS — LOGS E RASTREABILIDADE
create table if not exists webhook_logs (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null,
  loja_id uuid references lojas(id),
  payload_bruto jsonb,
  status_processamento text check (status_processamento in ('sucesso', 'erro', 'ignorado')),
  erro_mensagem text,
  created_at timestamptz default now()
);

-- Habilitar RLS
alter table webhook_logs enable row level security;
create policy "logs_read_own" on webhook_logs for select using (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()));

-- Adicionar índice para performance
create index if not exists idx_webhook_logs_data on webhook_logs(created_at desc);
