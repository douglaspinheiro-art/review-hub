

## Análise da auditoria: **PARCIALMENTE CORRETA**

Vou validar cada achado com evidências do código antes de propor correções.

### 🔴 Alto 1 — OAuth start sem `assert_store_access`

**Status: CONFIRMADO (risco real)**

Em `oauth-shopify/index.ts` e `oauth-nuvemshop/index.ts`, o `action=start`:
- Valida JWT via `verifyJwt(req)` ✅
- Recebe `store_id` do query param ✅
- **Insere em `oauth_states` sem verificar se `store_id` pertence a `auth.userId`** ❌

**Impacto real:** Moderado-alto. Atacante autenticado com UUID de loja de outro tenant poderia iniciar o fluxo OAuth e, no callback, a integração seria gravada em `integrations` para o `st.user_id` da tabela `oauth_states` (que é o atacante, não o dono real da loja). Mas como o upsert usa `onConflict: store_id,type`, pode sobrescrever integração legítima de outra loja.

**Correção:** Adicionar `await admin.rpc('assert_store_access', { p_store_id: storeId })` com cliente JWT-scoped antes do INSERT em `oauth_states`. Mesmo padrão já aplicado em `relatorio-semanal`, `benchmark-setor`, etc. na sessão anterior.

---

### 🔴 Alto 2 — Segredos de integrações expostos no frontend

**Status: CONFIRMADO mas mitigável via RLS**

`INTEGRATIONS_LIST_SELECT` inclui `config, config_json` (linha confirmada em `src/lib/supabase-select-fragments.ts`). Tokens OAuth (access_token, shop_url, etc.) trafegam para o browser.

**Mitigação em camadas:**
1. **Frontend**: criar `INTEGRATIONS_SAFE_SELECT` sem `config`/`config_json` e migrar páginas de listagem (`Integracoes.tsx`, `Canais.tsx`) para ele.
2. **Criar fragment `INTEGRATIONS_DETAIL_SELECT`** (com config) apenas para telas de edição onde o owner precisa ver/modificar credenciais. RLS já restringe a `user_id = auth.uid()`, então mesmo com `config`, só o dono vê — o risco real é **XSS exfiltrando tokens do localStorage/memory**, não vazamento cross-tenant.
3. Idealmente: mover campos sensíveis para tabela separada `integration_credentials` protegida por RPC `get_integration_config(id)` chamada apenas quando necessário. **Fora de escopo para hoje** (refactor grande).

**Decisão pragmática:** Remover `config`/`config_json` do select de listagem e manter em tela de detalhe/edição. Defesa em profundidade contra XSS.

---

### 🟠 Médio 1 — Onboarding usa "loja primária"

**Status: PLAUSÍVEL (preciso verificar)**

`getPrimaryStoreId()` em `Onboarding.tsx` — se realmente pega "primeira loja" sem respeitar `activeStoreId`, numa conta multi-loja, pode conectar integração à loja errada.

**Ressalva:** Onboarding é tipicamente executado por contas **novas** (1 loja só). O risco é baixo no fluxo padrão mas real se usuário re-abrir onboarding após criar segunda loja.

**Correção:** Usar `useStoreScope().activeStoreId` com fallback para primeira loja **apenas** se não houver loja ativa.

---

### 🟠 Médio 2 — `onConflict: "user_id,type"`

**Status: CONFIRMADO (bug real de isolamento multi-loja)**

Se um usuário tem 2 lojas e já conectou Shopify na loja A, ao conectar Shopify na loja B pelo onboarding, **sobrescreve a integração da loja A**. Isso é bug funcional + risco de isolamento.

**Correção:** Mudar para `onConflict: "store_id,type"` (consistente com os OAuth callbacks de Shopify/Nuvemshop que já usam isso).

**Pré-requisito SQL:** Verificar se existe `UNIQUE(store_id, type)` em `integrations`. Se não existir, adicionar via migração (com remoção do unique antigo `user_id, type` se houver).

---

### 🟠 Médio 3 — Credenciais em localStorage

**Status: CONFIRMADO (risco XSS)**

`integrationConfig` e `ga4Token` no rascunho local (`localStorage`) — tokens expostos a qualquer script com acesso ao DOM.

**Correção:** 
- Remover `integrationConfig.access_token`, `ga4Token`, e campos sensíveis do snapshot salvo em localStorage.
- Manter apenas metadados não-sensíveis (plataforma selecionada, nome, URL da loja).
- Re-solicitar credenciais se usuário abandonar e retomar o onboarding (UX aceitável).

---

## Plano de correção

### P0 (mesmo nível dos blockers anteriores)

**1. OAuth start ownership check** — `oauth-shopify` e `oauth-nuvemshop`:
- Após `verifyJwt`, criar cliente JWT-scoped e chamar `assert_store_access(store_id)`. Se falhar, retornar 403.

**2. onConflict multi-loja** — `src/pages/Onboarding.tsx` `persistActiveIntegration`:
- Trocar `onConflict: "user_id,type"` → `"store_id,type"`
- Migração SQL: garantir índice único `UNIQUE(store_id, type)` em `integrations`; drop do antigo se conflitar

### P1

**3. Remover credenciais do localStorage** — `Onboarding.tsx`:
- Filtrar `integrationConfig` e `ga4Token` antes de persistir rascunho
- Salvar apenas campos não-sensíveis

**4. SAFE_SELECT de integrações** — `src/lib/supabase-select-fragments.ts`:
- Criar `INTEGRATIONS_SAFE_SELECT` sem `config`/`config_json`
- Migrar `Integracoes.tsx` (listagem) para o safe select
- Manter `INTEGRATIONS_LIST_SELECT` apenas para telas de edição/detalhe onde o owner precisa gerenciar credenciais

**5. Primary store → active store** — `Onboarding.tsx`:
- `getPrimaryStoreId()` → usar `useStoreScope().activeStoreId` com fallback

---

## Arquivos a alterar

```
supabase/functions/oauth-shopify/index.ts         (assert_store_access no start)
supabase/functions/oauth-nuvemshop/index.ts       (assert_store_access no start)
src/pages/Onboarding.tsx                          (onConflict + localStorage + active store)
src/lib/supabase-select-fragments.ts              (INTEGRATIONS_SAFE_SELECT)
src/pages/dashboard/Integracoes.tsx               (usar SAFE_SELECT)
supabase/migrations/<novo>.sql                    (UNIQUE(store_id,type) em integrations)
```

---

## Fora de escopo (não bloqueador, documentar como follow-up)

- Mover `config`/`config_json` para tabela `integration_credentials` com RPC gateway (refactor grande; o controle por RLS + SAFE_SELECT já mitiga 90% do risco prático hoje).
- Auditoria completa de `localStorage` em toda a aplicação (outros drafts podem ter padrão similar).

---

## Veredito

A auditoria está **~85% correta**. Os 5 achados são reais, mas a severidade de "Alto 2" (config no select) é discutível: RLS já isola por `user_id`, então o risco principal é XSS, não vazamento cross-tenant. Mesmo assim, vale corrigir para defesa em profundidade.

**Recomendo aplicar P0 + P1 na mesma sessão.** Confirma?

