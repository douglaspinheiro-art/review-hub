

# Plano: OAuth Automatizado para Shopify e Nuvemshop + WooCommerce Auto-Auth

## Objetivo
Substituir a entrada manual de tokens por fluxos OAuth automatizados nas plataformas que suportam, reduzindo a fricção de onboarding drasticamente.

## O que muda para o lojista
- **Shopify/Nuvemshop:** Clica "Conectar" → abre popup da plataforma → autoriza → volta com token salvo automaticamente
- **WooCommerce:** Clica "Conectar" → redireciona ao WP → autoriza → chaves geradas e salvas
- **VTEX/Tray/Magento/Dizy:** Continua manual (com guia visual melhorado)

---

## Bloco 1 — Infraestrutura OAuth (Edge Functions)

### 1a. Edge Function `oauth-shopify`
- Rota `GET /start` → gera URL de autorização com `client_id`, `scopes`, `redirect_uri`, `state` (JWT com store_id)
- Rota `GET /callback` → recebe `code`, troca por `access_token` permanente via Shopify API, salva em `integrations` com pgcrypto
- Scopes necessários: `read_orders`, `read_customers`, `read_products`, `read_checkouts`
- **Secrets necessários:** `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`

### 1b. Edge Function `oauth-nuvemshop`
- Mesmo padrão: `start` → redirect → `callback` → troca code por token
- Endpoint: `https://www.tiendanube.com/apps/authorize/token`
- **Secrets necessários:** `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET`

### 1c. Edge Function `oauth-woocommerce`
- Usa o endpoint nativo `{site_url}/wc-auth/v1/authorize` que gera chaves automaticamente
- Callback recebe `consumer_key` e `consumer_secret` via POST
- Não requer client_id/secret — WooCommerce gera as chaves no servidor do lojista

### 1d. Tabela de state tokens
- Migration: tabela `oauth_states` (state_token, store_id, platform, expires_at) para validar callbacks e prevenir CSRF

---

## Bloco 2 — Frontend: Onboarding Step 2 Atualizado

Alterar `src/pages/Onboarding.tsx` Step 2:

- **Shopify/Nuvemshop/WooCommerce:** Mostrar botão "Conectar com [Plataforma]" que abre popup/redirect OAuth
  - Loading state enquanto aguarda callback
  - Após sucesso: ícone verde + "Loja conectada!" + avança automaticamente
  
- **VTEX/Tray/Magento/Dizy:** Manter formulário manual atual, mas adicionar:
  - Guia visual inline com screenshots de onde encontrar as credenciais
  - Link direto para a página de criação de chaves na plataforma

---

## Bloco 3 — Secrets e Pré-requisitos

Para que o OAuth funcione, você precisará:

1. **Shopify:** Criar um Shopify App (Partner Dashboard) → obter Client ID e Secret
2. **Nuvemshop:** Criar app no Portal de Parceiros Nuvemshop → obter Client ID e Secret
3. **WooCommerce:** Sem secrets extras (usa endpoint nativo do WP)

Os secrets `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `NUVEMSHOP_CLIENT_ID`, `NUVEMSHOP_CLIENT_SECRET` precisam ser adicionados no Supabase antes do deploy.

---

## Resumo de Execução

| Bloco | Tipo | Esforço |
|---|---|---|
| 1a. Edge Function oauth-shopify | Nova Edge Function | 30 min |
| 1b. Edge Function oauth-nuvemshop | Nova Edge Function | 25 min |
| 1c. Edge Function oauth-woocommerce | Nova Edge Function | 20 min |
| 1d. Migration oauth_states | SQL | 5 min |
| 2. Frontend onboarding refactor | Code edit | 30 min |
| 3. Secrets setup | Manual (você) | 10 min |

**Total:** ~2h de implementação

### Pré-requisito (você precisa fazer antes):
1. Criar app no Shopify Partner Dashboard → anotar Client ID e Secret
2. Criar app no Nuvemshop Partner Portal → anotar Client ID e Secret
3. Adicionar os 4 secrets no Supabase

### Resultado:
- **Shopify/Nuvemshop:** 1 clique para conectar (zero campos manuais)
- **WooCommerce:** 2 cliques (redirect + autorizar no WP)
- **Demais:** Manual com guia melhorado

