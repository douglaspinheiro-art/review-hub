## Objetivo
Passar nos 3 itens reprovados do automated check da Shopify:
1. **Webhooks de conformidade obrigatórios** — declarar `compliance_topics` no app
2. **Verificação HMAC** — garantir 401 em assinatura inválida, 200 em válida (já implementado, mas precisa estar registrado)
3. **Redirect para UI do lojista após autenticação** — não cair em `postMessage`/`window.close` no fluxo de install

---

## 1. Criar `shopify.app.toml` na raiz do projeto

A Shopify lê esse arquivo via `shopify app deploy` para registrar os webhooks de compliance no Partner Dashboard. Sem ele, o scanner reporta "compliance webhooks ausentes" mesmo se a function existir e responder corretamente.

Conteúdo (raiz do repo):

```toml
# shopify.app.toml — registrado via Shopify CLI (shopify app deploy)
client_id = "<SHOPIFY_CLIENT_ID>"   # mesmo do Partner
name = "LTV Boost"
application_url = "https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify"
embedded = false

[access_scopes]
scopes = "read_orders,read_customers,read_products,read_checkouts"

[auth]
redirect_urls = [
  "https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify/callback"
]

[webhooks]
api_version = "2026-04"

[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/shopify-compliance-webhooks"

[app_proxy]
# (omitido — não usamos)

[pos]
embedded = false

[build]
include_config_on_deploy = true
```

**Importante:** depois de commitar o arquivo, **você** precisa rodar localmente uma vez:
```bash
npm i -g @shopify/cli @shopify/app
shopify app config link    # vincula ao app já criado no Partner
shopify app deploy         # publica o config + webhooks de compliance
```

Sem o `shopify app deploy`, o Partner Dashboard não fica sabendo dos topics — e o scanner continua reprovando.

---

## 2. Verificar function `shopify-compliance-webhooks` (já existe, validar contrato)

Reler `supabase/functions/shopify-compliance-webhooks/index.ts` e garantir:
- Lê `req.arrayBuffer()` (raw) **antes** de qualquer parse JSON ✅ (já faz)
- Valida `X-Shopify-Hmac-Sha256` com `SHOPIFY_CLIENT_SECRET` (mesmo segredo do app) ✅ (já faz)
- HMAC inválido → 401 ✅
- HMAC válido + topic suportado → 200 com ack rápido (<5s) ✅
- HMAC válido + topic desconhecido → atualmente retorna 401; **mudar para 200** com log, para evitar reprovação caso a Shopify mande um topic novo no futuro

**Mudança pequena no código:** em `shopify-compliance-webhooks/index.ts`, quando `!SUPPORTED_TOPICS.has(topic)` mas HMAC já passou, retornar `jsonOk()` em vez de `unauthorized()`. Topics não suportados não são erro de auth.

---

## 3. Corrigir redirect pós-OAuth em `oauth-shopify/index.ts`

O fluxo de install (Shopify chama App URL com `?shop=&hmac=`) hoje termina em uma das duas situações:
- `isInstallFlow=true` → redireciona para `https://{shop}/admin/apps/{CLIENT_ID}` (URL embedded — não funciona, app é non-embedded)
- Caso geral → `redirectHtml()` com `window.opener.postMessage` + `window.close()` (não há opener no fluxo de install direto, então cai no fallback `APP_URL/onboarding?oauth=connected`)

O scanner espera **redirect HTTP 302 imediato** para a UI do app após o callback. Mudanças:

**a)** No callback, quando `isInstallFlow === true`, redirecionar 302 para:
```
${APP_URL}/dashboard/integracoes?shop={shop}&oauth=connected
```
(URL pública nossa, não a do admin Shopify, pois `embedded = false`)

**b)** Manter `redirectHtml()` apenas para o fluxo "conectar de dentro do dashboard" (onde existe `window.opener` real do popup).

---

## 4. Confirmação no Partner Dashboard (você faz, sem código)

Depois do `shopify app deploy`:
- Em **Configuração → Webhooks de conformidade**: as 3 URLs aparecem preenchidas automaticamente
- Em **Distribuição**: confirmar **"Use Shopify managed installation" desmarcado** (você precisa do legacy install flow, que já está marcado ✅)
- Rodar **"Executar verificações"** novamente

---

## Critério de pronto
- `shopify.app.toml` commitado na raiz
- Function `shopify-compliance-webhooks` retorna 200 em topics desconhecidos com HMAC válido
- `oauth-shopify` callback redireciona 302 para `${APP_URL}/dashboard/integracoes?...` no install flow
- Após `shopify app deploy` (manual, do seu lado), os 5 automated checks ficam ✅

## Fora do escopo
- Tornar o app embedded (App Bridge) — fica para depois, não é necessário para passar no review
- Implementar o export real de dados de cliente (`customers/data_request`) — a Shopify só exige ack <5s; o export real você produz manualmente em até 30 dias