## Objetivo
Fazer o app passar nos 4 checks automáticos do Shopify Partners que hoje estão falhando. O 5º (TLS) já passa.

---

## 1. Autenticar imediatamente após a instalação

**Problema:** hoje `oauth-shopify?action=start` só inicia OAuth quando chamado pelo frontend (com JWT do usuário). A Shopify, ao instalar, faz um GET direto na **App URL** sem JWT — e espera ser redirecionada para `/admin/oauth/authorize` na hora.

**Mudança em `supabase/functions/oauth-shopify/index.ts`:**
- Adicionar handler para `GET /` (sem `action`) que detecta `?shop=...&hmac=...&host=...` (parâmetros que a Shopify envia na instalação).
- Validar o HMAC desses params com `SHOPIFY_CLIENT_SECRET`.
- Gerar `state`, gravar em `oauth_states` (sem `user_id`, marcar como "install_flow").
- Responder com **HTTP 302** para `https://{shop}/admin/oauth/authorize?...` imediatamente.
- Como a instalação não tem usuário logado, depois do callback bem-sucedido redirecionar para tela de login/onboarding com o `store` já vinculado.

**Config Shopify Partners:**
- App URL: `https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify`

---

## 2. Redirecionar para a UI do app após autenticação

**Problema:** o callback hoje fecha o popup ou manda para `/onboarding?oauth=connected`. Para apps embutidos, a Shopify exige redirect para `https://{shop}/admin/apps/{api_key}` ou para a App URL com `host` e `shop`.

**Mudança em `oauth-shopify` (callback):**
- Detectar se a instalação veio do fluxo "install" (sem `user_id` em `oauth_states`) vs. "connect from dashboard".
- Caso install flow: redirecionar para `https://{shop}/admin/apps/{SHOPIFY_CLIENT_ID}` (abre o app embutido na Shopify Admin).
- Caso connect flow: manter o comportamento atual (`postMessage` + close popup).

---

## 3. Webhooks de compliance obrigatórios (GDPR)

**Problema:** faltam `customers/data_request`, `customers/redact`, `shop/redact`. Esses webhooks **não** podem ser registrados via API — precisam ser declarados nas configurações do app no Partners e respondidos por endpoints HTTPS do nosso lado.

**Nova edge function `supabase/functions/shopify-compliance-webhooks/index.ts`:**
- Single endpoint que aceita os 3 topics e roteia internamente por `X-Shopify-Topic`.
- Verifica HMAC com `SHOPIFY_CLIENT_SECRET` (se inválido → 401).
- `customers/data_request`: registra em `audit_logs` + (idealmente) gera export do que temos do cliente.
- `customers/redact`: deleta/anonimiza dados do cliente em `contacts`, `messages`, `orders_v3` filtrando por `email` ou `customer_id` da loja.
- `shop/redact`: deleta tudo da loja (rows com `store_id` correspondente) — chamado 48h após o app ser desinstalado.
- Resposta `200 OK` rápida (Shopify exige <5s).

**Config Shopify Partners → Configuration → Compliance webhooks:**
- Customer data request URL: `.../functions/v1/shopify-compliance-webhooks`
- Customer data erasure URL: `.../functions/v1/shopify-compliance-webhooks`
- Shop data erasure URL: `.../functions/v1/shopify-compliance-webhooks`

**Config `supabase/config.toml`:** adicionar `[functions.shopify-compliance-webhooks] verify_jwt = false`.

---

## 4. Verificação HMAC nos webhooks de produto/order

**Problema:** `webhook-cart`, `webhook-orders`, `webhook-refunds` validam só por `x-webhook-secret` (header nosso). A Shopify envia `X-Shopify-Hmac-Sha256` calculado com `SHOPIFY_CLIENT_SECRET` sobre o body bruto, e o automated check da Shopify usa isso.

**Mudança nos 3 endpoints (`webhook-cart`, `webhook-orders`, `webhook-refunds`):**
- Detectar se a request vem do Shopify (header `X-Shopify-Topic` presente).
- Se sim: ler o body como **texto bruto** primeiro, calcular HMAC SHA256 com `SHOPIFY_CLIENT_SECRET`, comparar (timing-safe) com `X-Shopify-Hmac-Sha256` (base64). Se inválido → 401.
- Se não tem `X-Shopify-Topic`: manter validação por `x-webhook-secret` (compatibilidade com outras plataformas).
- Helper compartilhado em `supabase/functions/_shared/shopify-hmac.ts` para reutilizar nos 3 endpoints + no compliance.

---

## 5. Secrets necessários

Confirmar que estão definidos no Supabase:
- `SHOPIFY_CLIENT_ID` (já existe)
- `SHOPIFY_CLIENT_SECRET` (já existe — usar tanto no token exchange quanto na verificação HMAC)

---

## Arquivos que serão criados/modificados

**Novos:**
- `supabase/functions/shopify-compliance-webhooks/index.ts`
- `supabase/functions/_shared/shopify-hmac.ts`

**Modificados:**
- `supabase/functions/oauth-shopify/index.ts` (install flow + redirect embutido)
- `supabase/functions/webhook-cart/index.ts` (HMAC Shopify)
- `supabase/functions/webhook-orders/index.ts` (HMAC Shopify)
- `supabase/functions/webhook-refunds/index.ts` (HMAC Shopify)
- `supabase/config.toml` (verify_jwt da nova função)

---

## Configurações manuais no Shopify Partners (você faz)

Depois do deploy:
1. **App URL**: `https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify`
2. **Allowed redirection URL(s)**: `https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify/callback`
3. **Compliance webhooks** (3 URLs idênticas): `https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/shopify-compliance-webhooks`
4. Rodar de novo o "Automated checks" no Partners.

---

## Critério de pronto

- Os 5 checks da imagem ficam ✅ no painel da Shopify.
- Instalar o app via link da Shopify Admin de uma loja de teste leva direto ao OAuth e devolve para a Admin embutida.
- Compliance webhooks respondem 200 com HMAC válido e 401 com HMAC inválido (testar com `curl` + assinatura forjada).