-- 🚀 AGENTE DE IA — LTV BOOST
-- Configuração do Agente Vendedor/Suporte

create table if not exists agente_ia_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  loja_id uuid references lojas(id) on delete cascade,
  ativo boolean default false,
  modo text check (modo in ('sugestao', 'piloto_automatico')) default 'sugestao',
  prompt_sistema text not null,
  conhecimento_loja text, -- Informações extras como tom de voz, política de frete, etc.
  updated_at timestamptz default now()
);

-- RLS
alter table agente_ia_config enable row level security;
create policy "agente_ia_own" on agente_ia_config for all using (auth.uid() = user_id);

-- Default prompt for new stores
insert into agente_ia_config (user_id, prompt_sistema)
select id, 'Você é um agente de IA especializado em e-commerce com foco em vendas, suporte e retenção.
Seu objetivo principal é: 1. Aumentar conversão, 2. Melhorar experiência do cliente, 3. Aumentar LTV (Lifetime Value).
Você atua como um vendedor consultivo + suporte + analista.
REGRAS GERAIS: Seja direto, claro e natural. Conduza para ação. Use linguagem amigável. Máximo 3-5 linhas.'
from auth.users
on conflict do nothing;
