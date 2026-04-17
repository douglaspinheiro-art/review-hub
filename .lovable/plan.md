
## Fase 3 — correção do drift de schema

**Diagnóstico (confirmado via SQL no remoto):**

| Coluna esperada pelo código | Status remoto | Ação |
|---|---|---|
| `conversations.sla_due_at` | ❌ ausente | adicionar coluna `timestamptz` |
| `conversations.assigned_to_name` | ❌ ausente | adicionar coluna `text` |
| `conversations.priority` | ❌ ausente | adicionar coluna `text` default `'normal'` |
| `message_sends.created_at` | ❌ ausente (existe `sent_at`) | já há fallback no `useDashboard`; padronizar para `sent_at` |
| `abandoned_carts.utm_source` | ❌ ausente | adicionar (campanhas usam UTM) |
| `stores.ticket_medio` | ❌ ausente | adicionar `numeric` default `0` |
| `stores.meta_conversao` | ❌ ausente | adicionar `numeric` default `2.5` |
| `messages.phone_number` | ❌ ausente | só aparece em UI como `conn.phone_number` (whatsapp_connections) — falso positivo, **nada a fazer** |

**Status das RPCs antes consideradas "404/400":**
- `get_whatsapp_bundle_v2`, `get_abandoned_carts_v2`, `get_roi_attribution_bundle_v2`, `get_analytics_super_bundle_v2` — todas existem com a assinatura usada pelo frontend.
- 400/404 anteriores nos logs eram causados por: (a) `get-cached-data` rodando com service-role sem JWT do caller, (b) ausência das guardas — ambos já corrigidos na Fase 1+2.

**Plano:**

1. **Migração única** adicionando as colunas ausentes (idempotente, `IF NOT EXISTS`):
   - `conversations`: `sla_due_at timestamptz`, `assigned_to_name text`, `priority text default 'normal'`
   - `abandoned_carts`: `utm_source text`, `utm_medium text`, `utm_campaign text`
   - `stores`: `ticket_medio numeric default 0`, `meta_conversao numeric default 2.5`
   - Índice em `conversations (store_id, sla_due_at)` para o cálculo de SLA breaches.

2. **Code-fix em `useDashboard.ts`** — remover o caminho `created_at` em `message_sends` (já que a coluna oficial é `sent_at`) para eliminar o fallback frágil.

**O que NÃO entra nesta fase:**
- Pipeline Dizy → `customers_v3` (causa raiz funcional do "Contatos vazio") — fica para o próximo ciclo, isolado.
- Reescrever as RPCs `get_funil_page_data` para consumir `stores.ticket_medio` (a coluna existirá após a migration; lógica continua igual).

Após aprovação, aplico a migration e o code-fix em sequência.
