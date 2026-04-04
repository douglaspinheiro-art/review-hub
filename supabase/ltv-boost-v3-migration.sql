-- 🚀 PROMPT DEFINITIVO v3 — LTV BOOST MIGRATION
-- Esta migração atualiza o banco para o novo modelo de "Conversion OS"

-- ─── LOJAS (ATUALIZAÇÃO) ──────────────────────────────────
alter table lojas add column if not exists conversion_health_score integer default 0 check (conversion_health_score between 0 and 100);
alter table lojas add column if not exists chs_historico jsonb default '[]';
alter table lojas add column if not exists segmento text default 'Outro';

-- ─── CANAIS ───────────────────────────────────────────────
create table if not exists canais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  tipo text check (tipo in ('loja_propria','mercado_livre','shopee','tiktok_shop')) not null,
  nome_canal text,
  plataforma text,
  credenciais_json jsonb,
  ativo boolean default true,
  ultima_sync timestamptz,
  status_sync text check (status_sync in ('ok','erro','sincronizando')) default 'ok',
  erro_sync text,
  reputacao_json jsonb,
  created_at timestamptz default now()
);

-- ─── CLIENTES UNIFICADOS (SUBSTITUI/EXPANDE CONTACTS) ──────
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  email text,
  telefone text,
  nome text,
  data_nascimento date,
  -- RFM unificado
  rfm_recencia integer,
  rfm_frequencia integer,
  rfm_monetario numeric(12,2),
  rfm_segmento text check (rfm_segmento in ('campiao','fiel','potencial_fiel','novo','promissor','em_risco','hibernando','perdido')),
  -- Segmentos comportamentais
  perfil_comportamental text check (perfil_comportamental in ('cacador_desconto','comprador_presente','comprador_mobile','comprador_desktop','comprador_impulso','leal_marca')),
  -- Canal e preferências
  canal_preferido text,
  compras_por_canal jsonb default '{}',
  ultima_compra_em timestamptz,
  ultima_compra_canal text,
  -- Scores
  churn_score numeric(3,2) default 0,
  customer_health_score integer default 0 check (customer_health_score between 0 and 100),
  chs_cliente_historico jsonb default '[]',
  -- Comunicação
  whatsapp_opt_out boolean default false,
  email_opt_out boolean default false,
  sms_opt_out boolean default false,
  ultima_msg_whatsapp timestamptz,
  ultima_msg_email timestamptz,
  msgs_sem_abertura integer default 0,
  created_at timestamptz default now(),
  unique (loja_id, email),
  unique (loja_id, telefone)
);

-- ─── PEDIDOS (V3) ─────────────────────────────────────────
create table if not exists pedidos_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  canal_id uuid references canais(id),
  canal_tipo text,
  pedido_externo_id text,
  valor numeric(12,2) not null,
  valor_desconto numeric(10,2) default 0,
  margem_estimada numeric(12,2),
  status text,
  is_primeira_compra boolean default false,
  produtos_json jsonb,
  created_at timestamptz default now(),
  entregue_em timestamptz
);

-- ─── PRODUTOS ─────────────────────────────────────────────
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  canal_id uuid references canais(id),
  produto_externo_id text,
  nome text not null,
  sku text,
  categoria text,
  preco numeric(10,2),
  custo numeric(10,2),
  estoque integer,
  media_avaliacao numeric(3,2),
  num_avaliacoes integer default 0,
  num_visualizacoes integer default 0,
  num_adicionados_carrinho integer default 0,
  num_vendas integer default 0,
  taxa_conversao_produto numeric(5,2),
  receita_30d numeric(12,2) default 0,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ─── CONFIGURAÇÕES V3 ─────────────────────────────────────
create table if not exists configuracoes_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  loja_id uuid references lojas(id) on delete cascade,
  meta_conversao numeric(5,2) default 2.5,
  ticket_medio numeric(10,2) default 250.00,
  margem_media numeric(5,2) default 40.0,
  -- Aprovação automática
  aprovacao_automatica boolean default false,
  auto_custo_maximo numeric(10,2) default 500,
  auto_potencial_minimo numeric(10,2) default 3000,
  auto_roi_minimo numeric(5,1) default 10.0,
  -- Proteção de frequência
  cap_msgs_whatsapp_semana integer default 2,
  cap_msgs_email_semana integer default 3,
  cooldown_pos_compra_dias integer default 7,
  -- Pulse semanal
  pulse_ativo boolean default true,
  pulse_dia_semana integer default 1,
  pulse_horario text default '08:00',
  pulse_numero_whatsapp text,
  -- Notificações gerais
  notif_whatsapp text,
  notif_email text,
  notif_frequencia text check (notif_frequencia in ('tempo_real','diario','semanal')) default 'tempo_real',
  updated_at timestamptz default now()
);

-- ─── PROBLEMAS ────────────────────────────────────────────
create table if not exists problemas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  canal_id uuid references canais(id),
  produto_id uuid references produtos(id),
  tipo text not null,
  titulo text not null,
  descricao text,
  causa_raiz text,
  severidade text check (severidade in ('critico','alto','medio','oportunidade')),
  impacto_estimado numeric(12,2),
  status text check (status in ('novo','snoozed','em_tratamento','resolvido','ignorado')) default 'novo',
  snoozed_ate timestamptz,
  detectado_em timestamptz default now(),
  resolvido_em timestamptz,
  dados_json jsonb
);

-- ─── PRESCRIÇÕES ──────────────────────────────────────────
create table if not exists prescricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  problema_id uuid references problemas(id),
  titulo text not null,
  descricao text,
  canal_execucao text check (canal_execucao in ('whatsapp','email','sms','multicanal')),
  segmento_alvo text,
  perfil_comportamental_alvo text,
  num_clientes_alvo integer,
  num_clientes_excluidos integer default 0,
  template_json jsonb,
  desconto_percentual numeric(5,2),
  desconto_tipo text check (desconto_tipo in ('percentual','frete_gratis','fixo')),
  melhor_horario text,
  custo_estimado numeric(10,2),
  potencial_estimado numeric(12,2),
  roi_estimado numeric(6,1),
  -- A/B Testing
  ab_teste_ativo boolean default false,
  ab_percentual_teste integer default 20,
  ab_status text check (ab_status in ('aguardando','rodando','concluido')) default 'aguardando',
  ab_resultado_json jsonb,
  status text check (status in ('aguardando_aprovacao','aprovada','em_execucao','concluida','rejeitada')) default 'aguardando_aprovacao',
  aprovada_em timestamptz,
  created_at timestamptz default now()
);

-- ─── EXECUÇÕES ────────────────────────────────────────────
create table if not exists execucoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  prescricao_id uuid references prescricoes(id),
  loja_id uuid references lojas(id) on delete cascade,
  enviados integer default 0,
  entregues integer default 0,
  aberturas integer default 0,
  cliques integer default 0,
  conversoes integer default 0,
  receita_gerada numeric(12,2) default 0,
  margem_gerada numeric(12,2) default 0,
  custo_desconto numeric(10,2) default 0,
  -- Attribution
  conversoes_diretas integer default 0,
  conversoes_assistidas integer default 0,
  -- CHS impact
  chs_antes integer,
  chs_depois integer,
  conversao_antes numeric(5,2),
  conversao_depois numeric(5,2),
  iniciada_em timestamptz default now(),
  concluida_em timestamptz
);

-- ─── COMUNICAÇÕES ENVIADAS ────────────────────────────────
create table if not exists comunicacoes_enviadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  prescricao_id uuid references prescricoes(id),
  execucao_id uuid references execucoes(id),
  canal text check (canal in ('whatsapp','email','sms')),
  status text check (status in ('enviado','entregue','aberto','clicado','convertido','bounce','opt_out','bloqueado_cap')) default 'enviado',
  enviado_em timestamptz default now(),
  aberto_em timestamptz,
  convertido_em timestamptz
);

-- ─── OPT-OUTS ─────────────────────────────────────────────
create table if not exists opt_outs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  cliente_id uuid references clientes(id),
  canal text,
  motivo text,
  registrado_em timestamptz default now()
);

-- ─── CALENDÁRIO SAZONAL ───────────────────────────────────
create table if not exists calendario_sazonal (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data_evento date not null,
  tipo text check (tipo in ('nacional','nicho','varejo')),
  segmentos_relevantes text[],
  dias_antecedencia_ideal integer default 14,
  descricao text
);

-- Dados iniciais do calendário brasileiro
insert into calendario_sazonal (nome, data_evento, tipo, segmentos_relevantes, dias_antecedencia_ideal) values
  ('Dia das Mães', '2026-05-10', 'nacional', '{"Moda","Beleza e Cosméticos","Casa e Decoração","Joias"}', 21),
  ('Dia dos Namorados', '2026-06-12', 'nacional', '{"Moda","Beleza e Cosméticos","Joias","Eletrônicos"}', 14),
  ('Dia dos Pais', '2026-08-09', 'nacional', '{"Eletrônicos","Moda","Casa e Decoração"}', 14),
  ('Black Friday', '2026-11-27', 'varejo', '{"Moda","Eletrônicos","Casa e Decoração","Beleza e Cosméticos","Suplementos","Pet","Alimentos"}', 30),
  ('Cyber Monday', '2026-11-30', 'varejo', '{"Eletrônicos","Moda"}', 7),
  ('Natal', '2026-12-25', 'nacional', '{"Moda","Eletrônicos","Brinquedos","Casa e Decoração","Alimentos"}', 30),
  ('Dia das Crianças', '2026-10-12', 'nacional', '{"Brinquedos","Moda infantil","Eletrônicos"}', 14),
  ('Dia da Mulher', '2026-03-08', 'nacional', '{"Moda","Beleza e Cosméticos","Joias"}', 7)
on conflict do nothing;

-- ─── RLS ──────────────────────────────────────────────────
alter table canais enable row level security;
alter table clientes enable row level security;
alter table pedidos_v3 enable row level security;
alter table produtos enable row level security;
alter table configuracoes_v3 enable row level security;
alter table problemas enable row level security;
alter table prescricoes enable row level security;
alter table execucoes enable row level security;
alter table comunicacoes_enviadas enable row level security;
alter table opt_outs enable row level security;

-- Políticas básicas (own records)
create policy "canais_own" on canais for all using (auth.uid() = user_id);
create policy "clientes_own" on clientes for all using (auth.uid() = user_id);
create policy "pedidos_v3_own" on pedidos_v3 for all using (auth.uid() = user_id);
create policy "produtos_own" on produtos for all using (auth.uid() = user_id);
create policy "configuracoes_v3_own" on configuracoes_v3 for all using (auth.uid() = user_id);
create policy "problemas_own" on problemas for all using (auth.uid() = user_id);
create policy "prescricoes_own" on prescricoes for all using (auth.uid() = user_id);
create policy "execucoes_own" on execucoes for all using (auth.uid() = user_id);
create policy "comunicacoes_enviadas_own" on comunicacoes_enviadas for all using (auth.uid() = user_id);
create policy "opt_outs_own" on opt_outs for all using (auth.uid() = user_id);
create policy "calendario_read" on calendario_sazonal for select using (true);
