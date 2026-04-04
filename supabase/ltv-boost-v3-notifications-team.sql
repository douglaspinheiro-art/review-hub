-- 🚀 INFRAESTRUTURA DE COMUNICAÇÃO E EQUIPE — LTV BOOST
-- SQLs para Notificações, Colaboração e Automação de Alertas

-- 1. TABELA DE NOTIFICAÇÕES (Para o NotificationBell)
create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  loja_id uuid references lojas(id) on delete cascade,
  titulo text not null,
  mensagem text,
  tipo text check (tipo in ('problema', 'prescricao', 'sistema', 'faturamento')),
  lida boolean default false,
  link text, -- Para onde redirecionar ao clicar
  created_at timestamptz default now()
);

-- 2. GESTÃO DE EQUIPE (Membros da Loja)
create table if not exists membros_loja (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  user_id uuid references auth.users not null,
  permissao text check (permissao in ('dono', 'admin', 'editor', 'leitura')) default 'editor',
  convidado_por uuid references auth.users,
  created_at timestamptz default now(),
  unique(loja_id, user_id)
);

-- 3. TRIGGER PARA NOTIFICAR ESTOQUE CRÍTICO
-- Sempre que um produto atingir estoque < 5, gera uma notificação automática
create or replace function notify_critical_stock()
returns trigger as $$
begin
  if new.estoque < 5 and (old.estoque >= 5 or old.estoque is null) then
    insert into notificacoes (user_id, loja_id, titulo, mensagem, tipo, link)
    values (
      new.user_id, 
      new.loja_id, 
      '📦 Estoque Crítico!', 
      'O produto ' || new.nome || ' atingiu ' || new.estoque || ' unidades. Risco de perda de vendas.',
      'problema',
      '/dashboard/produtos'
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_notify_stock
after insert or update on produtos
for each row execute procedure notify_critical_stock();

-- 4. RLS E SEGURANÇA
alter table notificacoes enable row level security;
alter table membros_loja enable row level security;

create policy "notificacoes_own" on notificacoes for all using (auth.uid() = user_id);
create policy "membros_read_own" on membros_loja for select using (
  auth.uid() = user_id OR 
  exists (select 1 from membros_loja where loja_id = membros_loja.loja_id and user_id = auth.uid() and permissao = 'dono')
);

-- 5. ADMIN PROMOTION (Snippet Utilitário)
-- Use este comando manualmente no SQL Editor para se tornar admin:
-- update profiles set role = 'admin' where email = 'seu-email@exemplo.com';
