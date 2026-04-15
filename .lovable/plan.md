

# Automação do Onboarding WhatsApp Meta — Arquitetura Escalável

## Problema Atual

Cada loja precisa manualmente:
1. Ir ao Meta Developer, criar app, configurar webhook
2. Copiar Phone Number ID + Access Token
3. Colar no dashboard LTV Boost

Isso inviabiliza 100+ lojas.

## Solução: Meta Embedded Signup (OAuth)

A Meta oferece o **Embedded Signup Flow** — um botão "Conectar WhatsApp" que abre um popup OAuth. O lojista autoriza, e a plataforma recebe automaticamente:
- Phone Number ID
- WABA ID  
- Access Token de longa duração (System User Token)

Nenhum copy-paste, nenhuma visita ao Meta Developer.

```text
┌──────────────────┐    OAuth popup    ┌──────────────┐
│  Dashboard LTV   │ ───────────────→  │  Meta Login   │
│  "Conectar WA"   │                   │  (Facebook)   │
└──────────────────┘                   └──────┬───────┘
                                              │ redirect + code
                                              ▼
                                    ┌──────────────────┐
                                    │  Edge Function    │
                                    │  meta-wa-oauth    │
                                    │  (troca code →    │
                                    │   token + IDs)    │
                                    └────────┬─────────┘
                                             │ salva na
                                             │ whatsapp_connections
                                             ▼
                                    ┌──────────────────┐
                                    │  Loja conectada   │
                                    │  automaticamente  │
                                    └──────────────────┘
```

## O que muda

### 1. Pré-requisitos no Meta
- Criar um **Meta Business App** com produto WhatsApp
- Habilitar **Embedded Signup** no app (requer verificação do Business)
- Configurar `META_APP_ID` e `META_APP_SECRET` como secrets (o `META_APP_SECRET` já existe)
- Adicionar um **System User** com permissão `whatsapp_business_messaging`

### 2. Nova Edge Function: `meta-wa-oauth`
- Recebe o `code` do redirect OAuth
- Troca por `access_token` de longa duração via Graph API
- Busca automaticamente Phone Number ID e WABA ID
- Cria/atualiza `whatsapp_connections` com todos os campos
- Registra webhook automaticamente na WABA (Graph API `/{waba_id}/subscribed_apps`)

### 3. Atualização do Dashboard WhatsApp
- Adicionar botão **"Conectar com Facebook"** (SDK `facebook-login`)
- Ao completar o OAuth, a conexão aparece automaticamente como "connected"
- Manter formulário manual como fallback para casos especiais
- Token fornecido pela Meta via Embedded Signup dura ~60 dias; adicionar job de refresh automático

### 4. Token Refresh Automático
- Nova Edge Function `meta-wa-token-refresh` (cron diário)
- Verifica tokens próximos de expirar (< 7 dias)
- Renova via Graph API `/oauth/access_token?grant_type=fb_exchange_token`
- Atualiza `whatsapp_connections.meta_access_token`
- Notifica lojista apenas se refresh falhar

### 5. Migration: nova coluna
- `whatsapp_connections.meta_token_expires_at` (timestamptz) — para saber quando renovar
- `whatsapp_connections.meta_business_id` (text) — Business Manager ID do lojista

## Sobre as credenciais que você enviou

As credenciais que você compartilhou (Phone Number ID `1003067482898885`, WABA ID `2161510034688293`, Token `EAAi...`) serão usadas como a **conta principal da plataforma** (System User). Elas vão como secrets globais:

| Secret | Valor |
|--------|-------|
| `META_APP_ID` | ID do app Meta (preciso que envie) |
| `META_APP_SECRET` | Já configurado ou a configurar |
| `META_SYSTEM_USER_TOKEN` | O token que você enviou |
| `META_PLATFORM_WABA_ID` | `2161510034688293` |
| `META_PLATFORM_PHONE_ID` | `1003067482898885` |

Com o Embedded Signup, cada loja recebe **suas próprias credenciais** automaticamente. O número da plataforma fica como fallback ou para envios internos.

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/meta-wa-oauth/index.ts` | Criar — troca OAuth code por token + IDs |
| `supabase/functions/meta-wa-token-refresh/index.ts` | Criar — cron de renovação de tokens |
| `supabase/migrations/...meta_oauth_columns.sql` | Criar — `meta_token_expires_at`, `meta_business_id` |
| `src/pages/dashboard/WhatsApp.tsx` | Modificar — botão "Conectar com Facebook" |
| `src/lib/whatsapp/meta-embedded-signup.ts` | Criar — helper client-side para o SDK Meta |
| `supabase/config.toml` | Adicionar config das novas functions |

## Ordem de execução

1. Migration (novas colunas)
2. Secret `META_APP_ID` (preciso do valor)
3. Edge Function `meta-wa-oauth`
4. Edge Function `meta-wa-token-refresh`
5. Helper client-side + botão no dashboard
6. Salvar token global como `META_SYSTEM_USER_TOKEN`

## Pré-requisito seu

Preciso que você confirme/envie:
- **META_APP_ID** — o App ID do seu app Meta (aparece no Meta Developer → Settings → Basic)
- Se o app Meta já tem **Embedded Signup** habilitado
- Se já passou pela **verificação do Business** no Meta Business Manager

