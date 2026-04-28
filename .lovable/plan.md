# WhatsApp-as-a-Service — Cobrança central por mensagem

A loja conecta o WhatsApp dela na sua conta Meta/BSP. Você cobra por uso (franquia do plano + pacotes avulsos), com saldo, hard limits, alertas e relatório de margem **só para admin**.

A base atual já cobre 60% do caminho:
- `whatsapp_connections` por `store_id` com `meta_phone_number_id`, `meta_waba_id`, `meta_access_token`, `provider='meta_cloud'`.
- Envio multi-tenant via `meta-whatsapp-send` + worker `process-scheduled-messages` (retry, cap por loja).
- Cobrança Mercado Pago + planos.
- Impersonação admin (`admin_active_sessions`) já implementada.

Falta a camada de **wallet/billing por mensagem**.

---

## Regra de visibilidade (crítica)

- **Loja vê:** saldo de mensagens (franquia + pacotes), quantidade enviada, valor cobrado dela, alertas. **Nunca** vê custo Meta nem margem.
- **Admin vê:** tudo acima + custo Meta por mensagem, margem por loja, P&L consolidado.
- Reforçado por **RLS**: tabela de custo Meta só legível por `has_role(uid,'admin')`. RPC pública para a loja retorna apenas saldo/uso, sem campos de custo.

---

## 1. Modelo de dados (nova migração)

`supabase/migrations/<ts>_whatsapp_as_a_service.sql`:

- **`wa_message_pricing`** — preço por categoria Meta (`marketing|utility|authentication|service`) e país. Campos: `category`, `country`, `cost_brl` (custo Meta — sensível), `price_brl` (cobrado da loja), `effective_from`. **RLS: SELECT só admin.**
- **`wa_wallets`** — uma linha por `store_id`: `included_quota`, `used_in_cycle`, `purchased_balance`, `cycle_start`, `cycle_end`, `hard_limit_brl`, `soft_limit_pct` (default 80), `auto_recharge_enabled`, `auto_recharge_pack_id`, `status` (`active|suspended`).
- **`wa_message_packs`** — catálogo público de pacotes (1k/5k/25k mensagens marketing) com `price_brl` (sem custo).
- **`wa_pack_purchases`** — compras (FK Mercado Pago `payment_id`, status, mensagens creditadas).
- **`wa_usage_events`** — uma linha por mensagem cobrada: `store_id`, `scheduled_message_id`, `wamid`, `category`, **`cost_brl_internal`** (custo Meta — sensível), `price_brl_charged` (cobrado da loja), `charged_at`, `source` (`included|purchased`), `status` (`reserved|confirmed|refunded`). Índice `(store_id, charged_at desc)`.
- **`wa_usage_daily`** — agregado `(store_id, date, category)` para painel da loja (sem custo) + view admin com custo.
- **`wa_alerts_log`** — alertas enviados (idempotência por ciclo).

**RLS:**
- `wa_wallets`, `wa_pack_purchases`, `wa_message_packs`, `wa_usage_daily` → RLS por `store_id` via `auth_row_read_user_store` (loja vê o seu).
- `wa_usage_events` → loja vê os próprios registros, **mas RPC de leitura para a loja omite `cost_brl_internal`**. Admin vê tudo.
- `wa_message_pricing` → **SELECT só admin** (`has_role(uid,'admin')`).

**RPCs:**
- `wa_wallet_charge(store_id, scheduled_message_id, category, country)` — atômica: lê preço, valida saldo, insere `wa_usage_events` (ambos os campos), debita. Retorna `{ ok, source, remaining, price_charged }` — nunca retorna custo.
- `wa_wallet_refund(usage_event_id, reason)` — estorna se envio falhar permanentemente.
- `wa_wallet_reset_cycle()` — cron mensal: zera `used_in_cycle` e `included_quota` conforme plano vigente; mantém `purchased_balance`.
- `wa_usage_summary_for_store(period)` — para o painel da loja (**sem custo, sem margem**).
- `wa_admin_margin_report(period, store_id?)` — só admin: receita, custo Meta, margem por loja.

## 2. Hook de cobrança no envio

No `process-scheduled-messages`, antes de `outboundSendMetaTemplate`/`outboundSendText`:

1. Detectar **categoria** da mensagem (template aprovado tem categoria; mensagem livre na janela 24h = `service`). Persistir `category` em `whatsapp_templates` quando sincronizar.
2. `wa_wallet_charge` (pré-débito). Se `insufficient_balance`:
   - `scheduled_messages.status='blocked_no_balance'`.
   - Disparar alerta `wallet_exhausted` (1x/ciclo via `wa_alerts_log`).
   - Se `auto_recharge_enabled`, criar preferência MP (mas envio dessa msg fica para próximo ciclo do worker após pagamento).
3. Enviar à Meta. Em erro permanente → `wa_wallet_refund`.
4. No webhook `meta-whatsapp-webhook` (status `delivered`/`failed`), atualizar `wa_usage_events.wamid` e `status`.
5. **Hard limit BRL** por ciclo: se `sum(price_brl_charged)` exceder, `wa_wallets.status='suspended'` e bloquear envios.

Flag `WA_BILLING_ENABLED` por ambiente para rollout gradual.

## 3. Pacotes avulsos + auto-recarga

- **Tab nova em `Billing.tsx`: "Mensagens WhatsApp"**
  - Saldo: franquia restante + pacotes.
  - Botões "Comprar 1k / 5k / 25k mensagens" (preços de venda apenas).
  - Toggle "Recarga automática quando saldo < 10%".
- Edge function nova **`wa-pack-purchase`** — cria preferência MP com `external_reference={ store_id, pack_id, type:'wa_pack' }`.
- `mercadopago-webhook` ganha branch `type==='wa_pack'`: insere `wa_pack_purchases`, soma em `wa_wallets.purchased_balance`, log auditoria.

## 4. Alertas

Cron novo **`wa-wallet-alerts`** (a cada 30min):
- 80% da franquia → email + WhatsApp interno: "Sua franquia está em 80%".
- 100% (ainda há pack) → "Franquia esgotada, usando pacote".
- Saldo total = 0 → "Envios pausados — comprar pacote" + CTA.
- Hard limit BRL → "Envios suspensos por proteção".
- `wa_alerts_log` evita duplicatas no ciclo.

**Nenhum alerta cita custo Meta.**

## 5. Painel da loja — `src/pages/dashboard/WhatsAppConsumo.tsx`

Tab dentro de `WhatsApp.tsx` ou rota nova:

- **Cards (4):** Franquia restante | Pacotes | Enviadas no mês | Próxima renovação.
- **Gráfico:** linhas por categoria (marketing/utility/service) últimos 30d via `wa_usage_summary_for_store`.
- **Tabela:** últimas 50 campanhas: `enviadas | entregues | falhas | valor cobrado (R$)`.
- **Botão "Comprar pacote"** → modal com `wa_message_packs`.
- **Histórico de pacotes** comprados.

Hook `useWaWallet` (TanStack Query). **Nenhum campo de custo Meta exposto.**

## 6. Painel admin — Margem por loja

Em `src/pages/admin/Admin.tsx`, **nova tab "Margem WhatsApp"** (visível só com `useIsAdmin`):
- Tabela: `loja | plano | franquia | usado | pacotes vendidos R$ | custo Meta R$ | margem R$ | margem %`.
- Filtro por mês + busca.
- Drilldown por loja → gráfico custo vs receita.
- Editor de `wa_message_pricing` (preço Meta + preço de venda).
- Export CSV.

Backed por `wa_admin_margin_report`.

## 7. Governança

- View `v_wa_store_health` (admin): conexão + saldo + alertas ativos + última falha.
- Throttle por loja já existe (`MAX_PARALLEL_STORES=10`).
- Auditoria em `audit_logs`: cada `wa_wallet_charge`, refund, recarga manual, edição de pricing.

---

## Detalhes técnicos

- 1 migração SQL (tabelas + RPCs + RLS + índices).
- Edge functions novas: `wa-pack-purchase`, `wa-wallet-alerts` (cron). Estendidas: `process-scheduled-messages` (débito), `mercadopago-webhook` (crédito de pack).
- Secrets: nenhum novo.
- Preços iniciais sugeridos (editáveis no admin): marketing R$ 0,12 venda / R$ ~0,07 custo (exemplo); utility R$ 0,04 / R$ ~0,02; service R$ 0,00.
- Frontend: 1 tab em `Billing` (compra/saldo), 1 tab em `WhatsApp` (consumo), 1 tab em `Admin` (margem).
- `WA_BILLING_ENABLED=false` no início → coleta `wa_usage_events` em modo **shadow** (mede sem cobrar) por 1–2 semanas antes de ligar bloqueio.

## Ordem de entrega

1. Migração + RPCs + RLS (com restrição de custo a admin).
2. Hook de débito em modo **shadow** (`WA_BILLING_ENABLED=false`).
3. Painel de consumo da loja + alertas.
4. Pacotes avulsos + auto-recarga.
5. Painel admin de margem + editor de pricing.
6. Ligar `WA_BILLING_ENABLED=true`.

Confirma para eu começar pela etapa 1 (migração + RPCs + RLS)?