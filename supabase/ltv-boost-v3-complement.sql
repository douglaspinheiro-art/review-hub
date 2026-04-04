-- 🚀 COMPLEMENTO SQL v3 — LTV BOOST
-- Adiciona funcionalidades de IA e métricas avançadas

-- 1. MÉTICAS DE FUNIL V3 (Snapshots Diários com Mobile/Desktop)
create table if not exists metricas_funil_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  canal_id uuid references canais(id),
  periodo text check (periodo in ('7d','30d','90d')) default '30d',
  visitantes integer default 0,
  produto_visto integer default 0,
  carrinho integer default 0,
  checkout integer default 0,
  pedido integer default 0,
  visitantes_mobile integer default 0,
  visitantes_desktop integer default 0,
  pedidos_mobile integer default 0,
  pedidos_desktop integer default 0,
  data_referencia date default current_date,
  created_at timestamptz default now()
);

-- 2. DIAGNÓSTICOS V3
create table if not exists diagnosticos_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  metricas_funil_id uuid references metricas_funil_v3(id),
  diagnostico_json jsonb not null,
  chs integer,
  chs_label text,
  modelo_ia text default 'claude-3-5-sonnet-20241022',
  created_at timestamptz default now()
);

-- 3. CORREÇÃO DA TABELA PRODUTOS (Coluna Gerada)
-- Nota: Para adicionar uma coluna gerada, às vezes é necessário recriar se a anterior existir.
-- Vamos apenas adicionar se não existir, ou você pode rodar um alter.
alter table produtos add column if not exists estoque_critico boolean 
  generated always as (estoque < 5) stored;

-- 4. FUNÇÃO PARA APPEND DE HISTÓRICO CHS
-- Esta função permite adicionar um novo score ao array de histórico sem sobrescrever
create or replace function append_chs_history(new_score integer, new_label text)
returns jsonb
language plpgsql
as $$
declare
    current_history jsonb;
    new_entry jsonb;
begin
    -- Cria a nova entrada
    new_entry := jsonb_build_object(
        'data', to_char(now(), 'DD/MM'),
        'score', new_score,
        'label', new_label
    );
    
    -- Retorna o array atualizado (limitado aos últimos 10 para não crescer infinitamente)
    -- Nota: A lógica de pegar o histórico atual deve ser feita no UPDATE da tabela
    return new_entry;
end;
$$;

-- Função auxiliar para ser usada no UPDATE
create or replace function update_loja_chs(loja_uuid uuid, new_score integer, new_label text)
returns void
language plpgsql
as $$
begin
  update lojas
  set 
    conversion_health_score = new_score,
    chs_historico = (
      case 
        when chs_historico is null or jsonb_typeof(chs_historico) != 'array' then '[]'::jsonb 
        else chs_historico 
      end || jsonb_build_object(
        'data', to_char(now(), 'DD/MM'),
        'score', new_score,
        'label', new_label
      )
    )
  where id = loja_uuid;
end;
$$;

-- 5. RLS PARA AS NOVAS TABELAS
alter table metricas_funil_v3 enable row level security;
alter table diagnosticos_v3 enable row level security;

create policy "metricas_v3_own" on metricas_funil_v3 for all using (auth.uid() = user_id);
create policy "diagnosticos_v3_own" on diagnosticos_v3 for all using (auth.uid() = user_id);

-- Índices de performance
create index if not exists idx_metricas_data on metricas_funil_v3(data_referencia desc);
create index if not exists idx_diagnosticos_loja on diagnosticos_v3(loja_id);
create index if not exists idx_clientes_rfm on clientes(rfm_segmento);
create index if not exists idx_produtos_estoque on produtos(estoque);
