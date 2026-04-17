

The user is asking my opinion on an OAuth rollout plan, not asking me to implement it. The build errors shown are a red herring — they're pre-existing TS issues in many edge functions unrelated to my recent edits. I should focus on giving a sharp opinion on the plan.

Let me evaluate:

**Strengths:**
- Phase 0 (hardening) correctly gates everything else
- Reuses existing primitives (`assert_store_access`, `oauth_states`, `consume_oauth_state`, `INTEGRATIONS_SAFE_SELECT`, `register-webhooks`) — no reinvention
- Behind-flag rollout per platform is conservative and correct
- Acceptance criteria include forged `store_id` test (the right adversarial check)
- Distinguishes "OAuth real" (Shopify/Nuvemshop/Woo) from "assisted connection" (VTEX/Tray) — accurate; VTEX/Tray don't have user-friendly OAuth
- Manual fallback preserved end-to-end

**Issues / refinements:**
1. **Onboarding draft key change** (`user_id,type` → `store_id,type`): we already did this for `persistActiveIntegration` upsert. Need to check the *localStorage draft key* is also keyed per-store, otherwise switching stores leaks draft state. Worth calling out.
2. **WooCommerce "1-click"**: WooCommerce has a real OAuth-like flow (Application Passwords / WC REST authentication endpoint with callback). Calling it "assisted" undersells it — it can be true 1-click for self-hosted Woo. But it depends on plugin config. Plan correctly hedges with manual fallback.
3. **VTEX**: doesn't have OAuth for app installs in the typical sense — uses appKey/appToken. Calling it "assisted" is correct but the plan should be explicit that there's no callback for VTEX, only guided manual entry + validation.
4. **Tray**: actually has OAuth 2 (consumer_key/consumer_secret + auth code). Could be real 1-click, not just assisted. Plan undersells it.
5. **`register-webhooks` idempotency**: already handles `already_exists` per platform — good. Plan should ensure callbacks pass `x-internal-secret` (already does via `invokeRegisterWebhooksFromCallback`).
6. **Cache invalidation (Phase 4)**: should explicitly list query keys: `integrations`, `integration-health`, `whatsapp-connections`, `dashboard-snapshot`. Otherwise vague.
7. **Observability**: plan suggests `request_id, store_id, platform, phase` — already partially done in `oauth-nuvemshop` (`logOAuth`). Standardize a shared helper `logOAuthEvent()` in `_shared/`.
8. **Missing: token refresh strategy**. Nuvemshop tokens don't expire, Shopify tokens are long-lived, but Woo/Tray have refresh tokens. Plan ignores expiry/rotation. Worth a Phase 4.5 note.
9. **Missing: revoke/disconnect flow**. When user disconnects, should call provider's revoke endpoint + delete webhooks + mark integration inactive. Not in plan.
10. **Phase ordering**: Phase 1 (Nuvemshop) is fine because Shopify/Nuvemshop are already done. Could parallelize Phase 2 (Woo) since `oauth-woocommerce` already exists.

**Verdict:** Solid plan, ~85% complete. The architecture and security gates are right. Add: (a) per-store draft key, (b) token refresh strategy, (c) disconnect/revoke flow, (d) explicit query keys for cache invalidation, (e) Tray as real OAuth (not just assisted).

Build errors note: these are pre-existing in many edge functions (not caused by my recent edits). They're TS strictness issues in `bulk-import-contacts`, `data-pipeline-cron`, `dispatch-campaign`, `dispatch-newsletter`, etc. Should mention briefly that they're orthogonal to this plan but worth a separate cleanup pass.

I'm in plan mode (read-only) and the user asked my opinion — no implementation needed. Just present the analysis.

---

## Veredito: **plano sólido (~85%), pronto para executar com 5 ajustes**

Os fundamentos estão corretos: gating em Fase 0, reúso de primitivas existentes (`assert_store_access`, `oauth_states`, `consume_oauth_state`, `INTEGRATIONS_SAFE_SELECT`, `register-webhooks`), fallback manual preservado, e behind-flag por plataforma. O critério de aceite "forjar `store_id` deve retornar 403" é exatamente o teste adversarial certo.

### O que está muito bom

- **Sequência de fases**: hardening primeiro, depois rollout incremental por plataforma. Correto.
- **Distinção OAuth vs. conexão assistida**: VTEX e Tray não têm OAuth tradicional para instalação de apps em SMB — chamar de "assistido" é honesto.
- **Reúso de infra existente**: nenhuma reinvenção. `consume_oauth_state` (one-time + TTL), `register-webhooks` (já idempotente via `already_exists`), `INTEGRATIONS_SAFE_SELECT` — tudo já está no codebase.
- **Gate de avanço explícito**: "só seguir para Fase 1 após teste forjado retornar 403" evita rollout em cima de base insegura.

### 5 ajustes que recomendo incorporar

**1. Chave de draft do onboarding por loja (não só upsert)**
> O plano corrige o `onConflict` do upsert (já feito), mas o **localStorage draft** também precisa ser keyed por `store_id`. Se o usuário troca de loja ativa no meio do onboarding, o draft anterior vaza credenciais entre lojas. Padrão: `localStorage.setItem(\`onboarding:draft:${storeId}\`, ...)`.

**2. Tray é OAuth 2 real, não "assistido"**
> Tray Commerce expõe `consumer_key/consumer_secret + authorization_code` flow com callback. Pode entrar na **Fase 2** (junto com Woo), não na Fase 3. VTEX sim — só tem `appKey/appToken` sem callback, fica como assistido em Fase 3.

**3. Faltou: estratégia de refresh/expiração de tokens**
> Nuvemshop não expira (✅), Shopify long-lived (✅), mas **Tray tem refresh_token (~24h)** e Woo Application Passwords podem ser revogadas pelo admin. Adicionar **Fase 4.5**: cron `oauth-token-refresh` por plataforma + flag `connection_status='token_expired'` na UI quando refresh falhar 3x.

**4. Faltou: fluxo de disconnect/revoke**
> Quando usuário clica "Desconectar" em `Integracoes.tsx`, o plano não cobre: (a) chamar endpoint de revoke do provedor, (b) deletar webhooks registrados (já temos `registered_webhooks` salvo no `config_json`), (c) marcar `is_active=false`. Sem isso, webhooks órfãos continuam batendo no nosso endpoint após "desconexão".

**5. Cache invalidation (Fase 4) — listar query keys explicitamente**
> "Garantir que mutações invalidem as query keys corretas" é vago. Listar:
> - `['integrations', storeId]` (lista)
> - `['integration-health', storeId]` (badge de status)
> - `['whatsapp-connections', storeId]`
> - `['dashboard-snapshot', storeId]` (KPIs que dependem de integração)
> 
> Sem essa lista, dev fica adivinhando e a UI fica stale após callback.

### Pontos menores / nice-to-have

- **Logger compartilhado**: `_shared/oauth-log.ts` com `logOAuthEvent({request_id, store_id, platform, phase, ok, detail})` para padronizar (já existe um `logOAuth` inline em `oauth-nuvemshop` — extrair).
- **Phase 1 e Phase 2 podem ser paralelas**: Nuvemshop e Woo são independentes. Se houver banda, paralelizar acelera time-to-value.
- **Métrica de funil OAuth**: instrumentar `oauth_started` / `oauth_callback_ok` / `oauth_callback_failed` em `analytics-events` para medir conversão por plataforma.

### Sobre os build errors mostrados

Os erros TS (`bulk-import-contacts`, `data-pipeline-cron`, `dispatch-campaign`, `dispatch-newsletter`, etc.) são **pré-existentes e ortogonais** a este plano OAuth — são problemas de tipagem do Supabase client e tipos `never` em joins. Não bloqueiam Phase 0–4, mas valem uma issue separada de "TS hygiene pass".

### Resumo executivo

Pode executar como está, **com a Fase 0 + os 5 ajustes acima incorporados**. A ordem que eu seguiria:

```
Fase 0 (hardening)         ← bloqueador, já 80% feito
  ├─ ajuste #1 (draft key per-store)
Fase 1 (Nuvemshop) + Fase 2 (Woo + Tray)   ← paralelas
  ├─ ajuste #2 (Tray como OAuth real)
Fase 3 (VTEX assistido)
Fase 4 (estado + caches + logs)
  ├─ ajuste #5 (query keys explícitas)
Fase 4.5 (refresh + disconnect)            ← novo
  ├─ ajuste #3 (token refresh)
  ├─ ajuste #4 (revoke flow)
```

Quer que eu transforme isso em tasks concretas e comece pela Fase 0 + ajuste #1?

