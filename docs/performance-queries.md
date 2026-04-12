# Consultas pesadas — EXPLAIN e listas

Objetivo: reproduzir no **SQL Editor** do Supabase (ou `psql`) planos estáveis para as rotas mais críticas. Substituir UUIDs de exemplo pelos de uma loja real.

## Listas no dashboard (padrão actual)

| Área | Estratégia |
|------|------------|
| Contatos | `useContacts` variant `list`: `count` + `range` no servidor. |
| Inbox — conversas | `useConversations`: infinite query com `range` (50 por página). |
| Inbox — mensagens | Últimas N por conversa (`ORDER BY created_at DESC` + limite; ver `useMessages`). |
| Canais — webhook logs | `useWebhookLogs`: `count` + `range`. |
| Carrinho abandonado — tabela | `abandoned_carts` com `count` + `range` (lista paginada). |
| Carrinho — destaque de recuperação agendada | `scheduled_messages` em **lotes** (`range` 500, teto 5000 linhas de metadata) em vez de um único `limit(3000)`. |

Outras páginas com agregações no RPC ou heatmap via `get_dashboard_snapshot` já evitam full-scan no browser quando o RPC está aplicado.

---

## 1. RPC `get_dashboard_snapshot`

```sql
explain (analyze, buffers, format text)
select public.get_dashboard_snapshot(
  '00000000-0000-0000-0000-000000000001'::uuid,
  30
);
```

Rever custo do nó `heatmap_data` / `message_sends` nas migrações `20260412220000_*` e `20260413120000_*`. Índices úteis: `idx_message_sends_store_sent`, `idx_message_sends_store_created`.

---

## 2. Lista de conversas (equivalente ao Inbox)

```sql
explain (analyze, buffers, format text)
select id, status, last_message_at, unread_count
from public.conversations
where store_id = '00000000-0000-0000-0000-000000000001'::uuid
order by last_message_at desc nulls last
limit 50;
```

Índices: ver migrações de inbox (`20260407223000_*`, `20260407234000_*`).

---

## 3. `abandoned_carts` (KPI fallback vs lista)

Quando o RPC `get_abandoned_cart_kpis` não existe, o cliente pode fazer agregação em memória — preferir o RPC em produção.

```sql
explain (analyze, buffers, format text)
select status, cart_value
from public.abandoned_carts
where store_id = '00000000-0000-0000-0000-000000000001'::uuid
  and created_at >= now() - interval '30 days';
```

---

## 4. `scheduled_messages` pendentes (metadata)

```sql
explain (analyze, buffers, format text)
select metadata
from public.scheduled_messages
where user_id = auth.uid()
  and status = 'pending'
  and store_id = '00000000-0000-0000-0000-000000000001'::uuid
order by id asc
limit 500;
```

Índice parcial relevante: `idx_scheduled_messages_store_pending_cart_id` (expressão em `metadata ->> 'cart_id'`), conforme migração `20260412190000_*`.

---

## 5. Dispatch / campanhas (browser)

Hooks como `useROIAttribution` e heatmap em Relatórios usam o snapshot RPC quando possível, evitando `message_sends` com `limit(8000)` no cliente. Se reactivar agregações no browser, repetir EXPLAIN em `message_sends` com o mesmo `where` e `sent_at`.

---

*Última revisão: alinhar estes exemplos sempre que novas migrações de índice forem adicionadas.*
