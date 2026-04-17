# Meta WhatsApp Embedded Signup — Setup

Permite ao lojista conectar o WhatsApp Business via popup OAuth da Meta, sem
precisar copiar tokens manualmente.

## 1. Pré-requisitos

- App Meta criado em [developers.facebook.com](https://developers.facebook.com/apps/) com produto **WhatsApp Business** + **Facebook Login for Business**.
- App em modo Live (Embedded Signup não funciona em Dev).
- Meta Business Verification aprovada.

## 2. Criar a Configuration de Embedded Signup

1. No Meta App Dashboard → **WhatsApp** → **Configuration**, criar uma nova **Embedded Signup configuration**.
2. Escolher *Setup type*: **WhatsApp Business Account**.
3. Definir permissões mínimas:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
4. Anotar o **Configuration ID** gerado (ex.: `1234567890123456`).

## 3. Secrets no Supabase

Definir em **Edge Functions → Secrets**:

| Secret | Valor |
|--------|-------|
| `META_APP_ID` | App ID da Meta |
| `META_APP_SECRET` | App Secret da Meta |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Configuration ID do passo 2 |
| `META_GRAPH_VERSION` | (opcional) `v21.0` por padrão |
| `META_WHATSAPP_VERIFY_TOKEN` | Token aleatório p/ webhook GET challenge |

## 4. Webhook callback

A função `meta-wa-oauth` registra automaticamente o webhook em:

```
${SUPABASE_URL}/functions/v1/meta-whatsapp-webhook
```

via `subscribed_apps` com `override_callback_url`. Não precisa configurar manualmente no
Meta Dashboard, mas deixe `META_WHATSAPP_VERIFY_TOKEN` definido para o GET challenge inicial.

## 5. Como o fluxo funciona

1. Lojista clica em **"Conectar com Facebook"** em `/dashboard/whatsapp`.
2. Browser carrega o SDK FB e chama `FB.login` com `config_id`.
3. Popup Meta autoriza e devolve um `code`.
4. Frontend envia `code + store_id` para `meta-wa-oauth` (com JWT do user).
5. Edge function:
   - troca `code` por short-lived token
   - troca por long-lived token (~60 dias)
   - descobre WABA via `debug_token` granular_scopes
   - obtém phone_number_id da WABA
   - registra webhook via `subscribed_apps`
   - **upsert** em `whatsapp_connections` na chave `(store_id, meta_phone_number_id)` (idempotente)
   - grava `audit_logs` com `action = whatsapp_embedded_signup`
6. UI invalida queries e mostra a nova conexão.

## 6. Idempotência

Reconectar a mesma WABA não cria duplicatas — usamos
`UNIQUE INDEX uq_whatsapp_connections_store_meta_phone (store_id, meta_phone_number_id)`
para `ON CONFLICT DO UPDATE`.

## 7. Renovação de token

Tokens long-lived expiram em ~60 dias. A função `meta-wa-token-refresh` deve rodar como cron (já existe) e atualiza `meta_access_token + meta_token_expires_at`.

## 8. Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Popup abre mas pede só Facebook Login | `META_EMBEDDED_SIGNUP_CONFIG_ID` não definido | Definir o secret e republicar |
| `Token exchange failed` | App Secret errado ou app em Dev | Verificar secret + Live mode |
| `webhook_subscribed: false` | App sem permissão `whatsapp_business_management` | Adicionar à Configuration |
| Cria conexão sem phone_number | WABA recém-criada sem número verificado | Lojista precisa verificar número primeiro |
| `Forbidden: store access denied` | User não é dono nem team-member da loja | Convidar o user via `team_members` |

## 9. Testes

```bash
supabase test functions meta-wa-oauth
```

Os testes em `oauth_test.ts` validam autenticação, validação de input e CORS — não fazem chamadas reais à Graph API.
