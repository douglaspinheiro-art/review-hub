-- 🚀 INFRAESTRUTURA OPERACIONAL v3 — LTV BOOST
-- SQLs finais para sustentar Fidelidade, Jornadas e Inteligência Real

-- 1. TABELAS DE FIDELIDADE
create table if not exists fidelidade_config (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade unique,
  pontos_por_real numeric(10,2) default 1.0,
  validade_pontos_dias integer default 365,
  tier_prata_min integer default 500,
  tier_ouro_min integer default 1500,
  tier_diamante_min integer default 5000,
  ativo boolean default true,
  updated_at timestamptz default now()
);

create table if not exists fidelidade_recompensas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  nome text not null,
  descricao text,
  custo_pontos integer not null,
  tipo text check (tipo in ('cupom_fixo','cupom_percentual','frete_gratis','brinde')),
  valor_beneficio numeric(10,2),
  ativo boolean default true,
  created_at timestamptz default now()
);

create table if not exists fidelidade_pontos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  loja_id uuid references lojas(id) on delete cascade,
  quantidade integer not null,
  tipo text check (tipo in ('credito','debito')),
  motivo text, -- ex: 'compra_pedido_123', 'resgate_recompensa_abc'
  expira_em timestamptz,
  created_at timestamptz default now()
);

-- 2. TABELAS DE JORNADAS (WORKFLOWS)
create table if not exists jornadas_config (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  tipo_jornada text not null, -- 'novo_cliente', 'carrinho_abandonado', etc
  ativa boolean default false,
  config_json jsonb default '{}', -- armazena delays, templates e canais ativos
  kpi_atual numeric(10,2) default 0,
  updated_at timestamptz default now(),
  unique(loja_id, tipo_jornada)
);

-- 3. BENCHMARKS DE SETOR (TABELA GLOBAL)
create table if not exists benchmarks_setor (
  id uuid primary key default gen_random_uuid(),
  segmento text unique not null,
  cvr_media numeric(5,2),
  cvr_top_20 numeric(5,2),
  taxa_carrinho_media numeric(5,2),
  taxa_checkout_media numeric(5,2),
  ticket_medio_referencia numeric(10,2),
  updated_at timestamptz default now()
);

-- Popula benchmarks iniciais (conforme Prompt v3)
insert into benchmarks_setor (segmento, cvr_media, cvr_top_20) values
  ('Moda', 2.8, 4.5),
  ('Beleza e Cosméticos', 3.1, 5.2),
  ('Suplementos', 3.4, 6.0),
  ('Eletrônicos', 1.9, 3.2),
  ('Pet', 2.6, 4.1),
  ('Casa e Decoração', 2.2, 3.8),
  ('Alimentos', 3.0, 4.8),
  ('Outro', 2.5, 4.0)
on conflict (segmento) do update set 
  cvr_media = excluded.cvr_media, 
  cvr_top_20 = excluded.cvr_top_20;

-- 4. SNAPSHOTS DE FORECAST
create table if not exists forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  data_calculo date default current_date,
  cenario_base numeric(12,2),
  cenario_com_prescricoes numeric(12,2),
  cenario_com_ux numeric(12,2),
  confianca_ia numeric(5,2),
  created_at timestamptz default now()
);

-- 5. SEGURANÇA (RLS)
alter table fidelidade_config enable row level security;
alter table fidelidade_recompensas enable row level security;
alter table fidelidade_pontos enable row level security;
alter table jornadas_config enable row level security;
alter table benchmarks_setor enable row level security;
alter table forecast_snapshots enable row level security;

-- Políticas (Simplificadas para o dono da loja)
-- Nota: assumindo que 'lojas' tem uma coluna 'user_id'. Se não tiver, vincular via profiles.
create policy "fidelidade_config_own" on fidelidade_config for all using (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()));
create policy "fidelidade_recompensas_own" on fidelidade_recompensas for all using (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()));
create policy "fidelidade_pontos_own" on fidelidade_pontos for all using (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()));
create policy "jornadas_config_own" on jornadas_config for all using (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()));
create policy "benchmarks_read_all" on benchmarks_setor for select using (true);
create policy "forecast_snapshots_own" on forecast_snapshots for all using (exists (select 1 from lojas where id = loja_id and user_id = auth.uid()));
