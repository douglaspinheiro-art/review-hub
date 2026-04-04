-- 🚀 MODO DE MANUTENÇÃO GLOBAL
create table if not exists sistema_config (
  id text primary key default 'config_geral',
  manutencao_ativa boolean default false,
  mensagem_manutencao text default 'Estamos realizando uma manutenção programada para melhorar sua experiência. Voltamos em breve!',
  updated_at timestamptz default now()
);

-- Inserir config inicial
insert into sistema_config (id, manutencao_ativa) 
values ('config_geral', false)
on conflict (id) do nothing;

-- RLS: Apenas admins podem editar, todos podem ler
alter table sistema_config enable row level security;
create policy "read_config_all" on sistema_config for select using (true);
create policy "update_config_admin" on sistema_config for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
