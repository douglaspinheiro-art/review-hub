

# Auditoria técnica das integrações de e-commerce — LTV Boost

Auditoria multi-tenant das 9 integrações (Shopify, Nuvemshop, VTEX, WooCommerce, Tray, Magento, Dizy, Yampi, Loja Integrada). Foco: vazamento entre lojas, isolamento de credenciais, normalização de dados.

---

## Etapa 1 — Mapa por plataforma

| Plataforma | Auth | Onde configura | Dados consumidos | Webhook | Sync ativo |
|---|---|---|---|---|---|
| **Shopify** | Access Token (admin) + HMAC SHA256 | `Integracoes.tsx` → `validate-integration` | pedidos, carrinhos, clientes | `webhook-cart`, `webhook-orders`, `integration-gateway` | webhook |
| **Nuvemshop/Tiendanube** | OAuth (`oauth-nuvemshop`) → access_token + user_id; verificação por `x-linkedstore-token` | OAuth + manual | pedidos, carrinhos, produtos | `webhook-cart`, `webhook-orders` | webhook + OAuth |
| **VTEX** | App Key + App Token; verificação por `x-vtex-api-appkey` | manual | pedidos (orderId/Domain), carrinhos | `webhook-cart`, `webhook-orders` | webhook |
| **WooCommerce** | OAuth (`oauth-woocommerce`) Consumer key/secret + HMAC | OAuth + manual | pedidos, carrinhos | `webhook-cart`, `webhook-orders` | webhook |
| **Tray** | API address + Access Token + HMAC opcional | manual | pedidos, carrinhos | `webhook-cart`, `webhook-orders` | webhook |
| **Magento 2** | Base URL + Access Token (sem HMAC nativo) | manual | pedidos | `webhook-orders` (sem verify HMAC) | webhook |
| **Dizy Commerce** | Magento white-label: Base URL + `api_key` (ou `token`) | manual | pedidos via REST `/V1/orders` | nenhum | **cron 15 min** + backfill (`sync-dizy-orders`) |
| **Yampi** | Token + HMAC `x-yampi-hmac-sha256` | manual | pedidos, carrinhos | `webhook-cart`, `webhook-orders` | webhook |
| **Loja Integrada** | Sem fluxo dedicado — só aparece no select de plataforma | nenhum | nenhum | nenhum | **❌ não há código** |

---

## 🔴 BUGS CRÍTICOS (vazamento entre tenants)

### BUG-1 — `Integracoes.tsx` ignora `store_id` ao salvar credenciais (multi-loja)
**Arquivo**: `src/pages/dashboard/Integracoes.tsx:200-234`

```ts
const { data: allStores } = await supabase.from("stores")
  .select("id").eq("user_id", user!.id)
  .order("created_at", { ascending: true });
const storeId = allStores?.[0]?.id ?? null;   // ⚠ sempre a 1ª loja

const { data: existingRow } = await supabase.from("integrations")
  .select("id").eq("user_id", user!.id).eq("type", type)   // ⚠ sem store_id
  .maybeSingle();
```

**Impacto**: contas com 2+ lojas (loja A e B) — ao conectar Shopify para a loja B, o token sobrescreve o registro da loja A (mesmo `user_id+type`). E se for criar novo, é inserido com `store_id` da **primeira** loja, não a loja ativa.
**Consequência real**: webhook da loja B chega → `webhook-cart` busca em `integrations WHERE store_id=B AND type LIKE '%shopify%'` → não encontra nada → 401. Pior: `process-scheduled-messages` puxa credenciais e dispara mensagens com identidade da loja errada.

**Correção**:
```ts
const storeId = scope.activeStoreId;   // do StoreScopeContext
const { data: existingRow } = await supabase.from("integrations")
  .select("id")
  .eq("user_id", user!.id).eq("type", type).eq("store_id", storeId)
  .maybeSingle();
```
+ migração SQL: `UNIQUE (store_id, type) WHERE is_active = true` em `integrations`.

---

### BUG-2 — `webhook-cart`/`webhook-orders` aceitam qualquer integração do mesmo tipo
**Arquivo**: `supabase/functions/_shared/normalize-webhook.ts:99-104, 187`

```ts
function rowMatchesSource(row, source) {
  return aliases.some(a => row.type.includes(a) || row.name.includes(a));
}
const match = data.find(r => rowMatchesSource(r, source));   // ⚠ primeiro match
```

**Impacto**: se uma loja tiver duas integrações Shopify (ex.: principal + outlet) — ou após o BUG-1 deixar lixo histórico — o verifier pode validar o HMAC com o secret **errado** e ainda assim aceitar (porque a busca é por substring, não por integração ativa única). Pior: aceita também `name LIKE '%shopify%'` mesmo se `type='custom'`.

**Correção**: matching estrito por `type` exato + um único registro ativo por (store_id, type), garantido por unique index.

---

### BUG-3 — `channels` table sem isolamento por `store_id`
**Arquivo**: migration `20260415143708_29667bb9-...sql:32-34`

```sql
CREATE POLICY "canais_own" ON channels FOR ALL TO authenticated
  USING (auth.uid() = user_id);   -- ⚠ sem store_id
```

`channels.credenciais_json` guarda tokens Magento/Dizy/etc. Em conta com multi-loja, qualquer query de `channels` vê os canais de **todas** as lojas do mesmo dono. `useLTVBoost.ts:255-260` já filtra por `store_id` em runtime, mas **frontend pode trocar de store sem invalidar**: o cache TanStack pode servir credenciais cruzadas em race conditions.

**Correção**: adicionar política `auth_row_read_user_store(user_id, store_id)` (mesmo padrão de `customers_v3`).

---

### BUG-4 — Magento 2 não verifica HMAC em `webhook-orders`
**Arquivo**: `supabase/functions/webhook-orders/index.ts` (faltando branch `magento`)

`detectSource` retorna `"magento"` mas o switch de verificação só cobre shopify/woo/nuvemshop/vtex/tray/yampi. Magento cai no shared-secret blanket (`x-webhook-secret`), que é **global** — qualquer atacante com esse secret pode forjar pedidos para qualquer `store_id`.

**Correção**: implementar `verifyMagentoToken` (header `x-magento-token` ou Bearer), exigir secret por loja.

---

### BUG-5 — Loja Integrada listada mas sem implementação
**Arquivo**: `src/lib/ecommerce-platforms.ts`

Aparece no select de plataforma do onboarding. Não há `normalizeLojaIntegrada()`, nenhum verifier, nenhum sync. Usuários que selecionam Loja Integrada criam expectativa falsa e ficam sem nenhuma integração funcional.

**Correção**: ou remover da lista até implementar, ou adicionar normalizador (estrutura: `pedido.cliente`, `pedido.itens[]`, `pedido.totais`).

---

## 🟠 BUGS DE INCONSISTÊNCIA ENTRE PLATAFORMAS

### BUG-6 — Status de pedido diferentes não normalizados de forma consistente
- Shopify: `financial_status: "paid" | "pending" | "refunded"`
- WooCommerce: `status: "completed" | "processing" | "on-hold"`
- VTEX: `status: "invoiced" | "payment-approved" | ...`
- Magento: `status: "processing" | "complete" | "shipped"`
- Tray: PT/EN misturado (`"aprovado"`, `"pago"`, `"approved"`)
- Yampi: `status.alias: "paid"`

`normalize-webhook.ts` mapeia para `is_paid` mas dispara `post_purchase` em momentos semanticamente diferentes (Shopify=pago, Woo=processing, VTEX=invoiced ≈ faturado mas não pago). Lojas multi-plataforma recebem mensagens em estados divergentes.

**Correção**: matriz de status normalizada documentada + flag `is_paid` só após confirmação real (Woo: `completed`; VTEX: `payment-approved`).

### BUG-7 — Timezones perdidos
Nenhum normalizador converte `created_at` para UTC nem registra TZ original. VTEX retorna `creationDate` em horário do servidor da loja; Shopify em ISO UTC; Tray em horário Brasília sem offset. Resulta em `last_purchase_at` e cohorts com até 3h de drift.

### BUG-8 — Telefones internacionais marcados como BR
`normalizePhone()` (linha 220-227): qualquer número com 10-11 dígitos vira `55+...`. Loja em PT/AR/MX com telefone nacional de 10 dígitos → vira BR inválido → mensagens WhatsApp falham silenciosamente.

---

## 🟠 BUG DE ATRIBUIÇÃO

### BUG-9 — `useDashboard.ts:1079` lê `attribution_events` sem `store_id`
```ts
supabase.from("attribution_events")
  .select("order_value,order_date,attributed_campaign_id")
  .eq("user_id", effectiveUserId)   // ⚠ sem store_id
```
Mitigado depois por `scopeAttributionEventsForStore()` que filtra por `storeCampaignIds`, **mas** transfere todas as linhas pela rede. Em conta multi-loja com 100k eventos, custo + risco de exposição de IDs de pedidos de outras lojas para o cliente browser.

---

## 🟡 PAGINAÇÃO

### BUG-10 — Sync Dizy sem cursor real
`sync-dizy-orders` usa `last_synced_at` como cursor de tempo, mas Magento REST não garante ordem por `updated_at` em alta concorrência. Pedidos editados retroativamente são perdidos. Também não pagina `?searchCriteria[pageSize]` — cap em 100 por chamada e não loop.

### BUG-11 — `useLTVBoost.ts:283` `orders_v3` `.limit(5000)` sem paginação
Lojas com >5k pedidos em `CANAIS_ORDER_STATS_DAYS` perdem dados nas estatísticas de canal.

---

## Etapa 7 — Por que `/dashboard/campanhas` mostra dados de outra loja

**Causa raiz**: combinação de **BUG-1** + cache TanStack:

1. Usuário troca de loja A → B no `StoreSwitcher`.
2. `StoreScopeContext.setActiveStoreId` (linha 91-103) só invalida queries que contêm o `previousStoreId` no `queryKey`.
3. `useCampaigns` query key inclui `storeKey = scope.activeStoreId ?? ""` — então invalidação funciona **para o caminho RPC** (linha 437: `get_campaigns_bundle_v2(p_store_id)`).
4. **MAS** o fallback em `useCampaigns:511` (`.eq("user_id", effectiveUserId)` sem `.eq("store_id")`) é executado quando:
   - `storeOptions.length === 0` no primeiro render (StoreScopeContext ainda carregando) → cacheia sob `storeKey=""` → **mostra todas as campanhas do user (todas as lojas)**;
   - ou `sourcePrescriptionIds` está set (deep link `?prescription=...`).
5. Quando o store carrega, query muda de key, mas a UI já mostrou os dados misturados durante o flash.

**Correção**:
- Bloquear sempre que `!storeId` (remover o fallback `user_id`-only).
- No `StoreScopeContext`, suspender renders dependentes até `ready === true`.
- Adicionar `.eq("store_id", storeId)` no fallback do `prescriptionIds`.

---

## Plano de correção (a aplicar no modo default, por prioridade)

| # | Severidade | Arquivo | Ação |
|---|---|---|---|
| 1 | 🔴 | `Integracoes.tsx` | Usar `scope.activeStoreId`; lookup por `(user_id, type, store_id)`; bloquear se não houver store ativa |
| 2 | 🔴 | migration | `CREATE UNIQUE INDEX ON integrations(store_id, type) WHERE is_active`; backfill `integrations.store_id` para registros NULL |
| 3 | 🔴 | `_shared/normalize-webhook.ts` | Match estrito por `type`, não substring; respeitar `is_active` |
| 4 | 🔴 | migration | RLS de `channels`: `auth_row_read_user_store(user_id, store_id)`; tornar `store_id` NOT NULL |
| 5 | 🔴 | `webhook-orders/index.ts` | Adicionar branch `magento` com verificação de token por loja |
| 6 | 🔴 | `ecommerce-platforms.ts` | Remover "Loja Integrada" até implementar normalizer |
| 7 | 🟠 | `webhook-orders/normalizers` | Documentar matriz de status + corrigir Tray/VTEX `is_paid` |
| 8 | 🟠 | `_shared/normalize-webhook.ts` | `normalizePhone`: respeitar `stores.country_code` em vez de assumir BR |
| 9 | 🟠 | `useDashboard.ts:1079` | Filtrar `attribution_events` por `store_id` quando disponível |
| 10 | 🟠 | `useCampaigns:511` | Remover fallback `user_id`-only; sempre exigir `storeId` |
| 11 | 🟡 | `sync-dizy-orders` | Loop de paginação + cursor por `entity_id`, não só `updated_at` |

**Fora de escopo desta auditoria** (mas observado): `affiliate_referrals`, `inbox_routing_settings` e `journeys_config` também não usam o helper `auth_row_*`. Endereçar em uma fase B futura.

Sugiro aprovar para começar pela **Fase A (BUGs 1-6, todos 🔴)**: 1 migração + 4 arquivos de código. Quer que eu prossiga?

