## Diagnóstico das screenshots

A maior parte da configuração está correta, mas **3 pontos precisam de ajuste** no Shopify Partners (e não exigem mudança de código nosso):

### ✅ Já está correto
- **URL do app**: `https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify`
- **URLs de redirecionamento**: `.../oauth-shopify/callback`
- **"Usar fluxo de instalação legado"** marcado — combina com o nosso código (OAuth clássico).
- **Versão da API de webhooks**: `2026-04`
- **Escopos**: a lista é gigantesca. Nosso código só usa `read_orders, read_customers, read_products, read_checkouts`. **Sugestão:** reduzir para esses 4 — escopos demais fazem a Shopify reprovar no review ("requesting more access than necessary").

### ⚠️ Precisa ajustar no Partners (você faz, sem código)

**1. URL de preferências** está apontando para o callback OAuth:
```
❌ atual:  https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/oauth-shopify?action=callback
✅ trocar: https://ltvboost.com.br/dashboard/integracoes
```
Quando o lojista clica em "App preferences" no Admin, ele cai no callback sem `code`/`state` → erro 400. Tem que ser uma página da nossa UI.

**2. "Incorporar app no admin da Shopify"** está marcado, mas **nosso app não é embedded** (não usa App Bridge nem session tokens). Isso reprova no automated check de embedded apps. Duas opções:
- **Recomendado agora:** desmarcar essa caixa → vira app standalone (abre fora do Admin). Passa nos checks sem código novo.
- Alternativa (trabalho grande): manter marcado e construir uma página embedded com App Bridge. Não vale a pena para MVP.

**3. Compliance webhooks (GDPR)** — não aparecem nas screenshots. Precisa adicionar em **Configuration → Compliance webhooks** os 3 endpoints, todos apontando para o mesmo URL:
```
Customer data request URL: https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/shopify-compliance-webhooks
Customer data erasure URL: https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/shopify-compliance-webhooks
Shop data erasure URL:     https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/shopify-compliance-webhooks
```
A function `shopify-compliance-webhooks` já existe no projeto e valida HMAC com `SHOPIFY_CLIENT_SECRET`.

### 🔧 Mudança de código necessária
**Nenhuma.** O backend Shopify (oauth-shopify, shopify-compliance-webhooks, webhook-cart com HMAC, _shared/shopify-hmac.ts) já está implementado e deployado da rodada anterior.

## Checklist final no Partners
1. Reduzir escopos para `read_orders,read_customers,read_products,read_checkouts`
2. Trocar URL de preferências para `https://ltvboost.com.br/dashboard/integracoes`
3. Desmarcar "Incorporar app no admin da Shopify"
4. Adicionar os 3 compliance webhook URLs
5. Confirmar que o secret `SHOPIFY_CLIENT_SECRET` está definido nas Edge Function Secrets do Supabase
6. Rodar "Automated checks" no Partners de novo

## Critério de pronto
- Os 5 automated checks ficam ✅
- Instalar via link de loja de teste leva para OAuth e devolve para `/onboarding?oauth=connected`
- `curl` para `shopify-compliance-webhooks` com HMAC inválido retorna 401