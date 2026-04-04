-- ConvertIQ migration — run in Supabase SQL Editor

-- Tabela de dados da loja
create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  nome text not null,
  plataforma text check (plataforma in ('shopify','nuvemshop','woocommerce','vtex','tray','outro')),
  url text,
  segmento text,
  ticket_medio numeric,
  ga4_property_id text,
  ga4_access_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Métricas do funil (preenchidas manualmente ou via GA4)
create table if not exists metricas_funil (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas not null,
  data date not null default current_date,
  visitantes int not null default 0,
  visualizacoes_produto int not null default 0,
  adicionou_carrinho int not null default 0,
  iniciou_checkout int not null default 0,
  compras int not null default 0,
  receita numeric not null default 0,
  created_at timestamptz default now()
);

-- Diagnósticos gerados pela IA
create table if not exists diagnosticos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas,
  status text not null default 'pending' check (status in ('pending','processing','done','error')),
  score int check (score >= 0 and score <= 100),
  taxa_conversao numeric,
  meta_conversao numeric not null default 2.5,
  resumo text,
  recomendacoes jsonb,
  dados_funil jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Configurações ConvertIQ por usuário
create table if not exists configuracoes_convertiq (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  meta_conversao numeric not null default 2.5,
  alertas_ativos boolean not null default true,
  integracao_ga4 boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table lojas enable row level security;
alter table metricas_funil enable row level security;
alter table diagnosticos enable row level security;
alter table configuracoes_convertiq enable row level security;

create policy "users own lojas"
  on lojas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users own metricas_funil"
  on metricas_funil for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users own diagnosticos"
  on diagnosticos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users own configuracoes_convertiq"
  on configuracoes_convertiq for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger lojas_updated_at before update on lojas
  for each row execute function set_updated_at();

create trigger diagnosticos_updated_at before update on diagnosticos
  for each row execute function set_updated_at();

create trigger configuracoes_convertiq_updated_at before update on configuracoes_convertiq
  for each row execute function set_updated_at();
