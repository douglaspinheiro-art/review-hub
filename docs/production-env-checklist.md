# Production Environment Checklist

Use este checklist antes de liberar tráfego real.

## Frontend (Vite) — build / Vercel

- `VITE_SUPABASE_URL`
  - Deve apontar para o projeto Supabase de produção.
- `VITE_SUPABASE_ANON_KEY`
  - Chave `anon` do projeto de produção.
- `VITE_BETA_LIMITED_SCOPE` (recomendado para beta com usuários reais)
  - Defina `true` para ocultar/bloquear canais pesados (WhatsApp, newsletter, campanhas, inbox, automações, carrinho abandonado). Ver `src/lib/beta-scope.ts`.
- Referência local: copie de `.env.example` na raiz do repositório.

### Comandos

- `npm run validate:env:frontend` — valida só variáveis Vite (deve rodar no ambiente onde o build de produção roda).
- `npm run validate:env:edge` — valida secrets usados pelas Edge Functions (definir variáveis antes).
- `npm run release:check` — smoke estrutural + teste de `ProtectedRoute` + valida env **se** `VITE_*` / secrets Supabase já estiverem exportados.

## Authentication (Dashboard Supabase)

Ajuste em **Authentication → URL configuration** do projeto:

1. **Site URL**
   - URL canônica de produção em **HTTPS** (ex.: `https://app.seudominio.com`), não `localhost`.

2. **Redirect URLs**
   - Inclua **cada origem** em que o app roda (produção + previews + dev), pois `resetPasswordForEmail` usa:
     - `redirectTo: ${window.location.origin}/reset-password` (`src/pages/Login.tsx`).
   - Para cada host, inclua explicitamente:
     - `https://<host>/reset-password`
     - `https://<host>/**` (ou os paths que a UI do Supabase permitir).
   - Exemplos comuns de desenvolvimento/preview (ajuste aos seus hosts reais):
     - `http://localhost:8080/**`, `http://localhost:8081/**`, `http://localhost:3000/**`
     - URL de preview (ex.: Lovable/Vercel preview).

3. **Templates de e-mail**
   - **Confirm signup** (se confirmação por e-mail estiver ativa): texto e link coerentes; evitar usuários “presos” sem confirmar.
   - **Reset password**: link deve respeitar os Redirect URLs acima.

4. **SMTP e entregabilidade**
   - Produção: configure SMTP custom ou remetente verificado; valide SPF/DKIM/DMARC no domínio de envio.
   - Teste com caixas reais (Gmail/Outlook) antes do go-live.

## Supabase Edge Functions — secrets (matriz rápida)

| Secret | Uso principal |
|--------|----------------|
| `SUPABASE_URL` | Todas as funções |
| `SUPABASE_SERVICE_ROLE_KEY` | Todas as funções |
| `APP_URL` | Links absolutos (ex.: newsletter — `dispatch-newsletter`) |
| `ALLOWED_ORIGIN` | CORS / `validateBrowserOrigin` (`_shared/edge-utils.ts`) — use a origem exata do app em produção |
| `UNSUBSCRIBE_TOKEN_SECRET` | `unsubscribe-contact`, tokens HMAC |
| `CONVERSION_ATTRIBUTION_SECRET` | `conversion-attribution` |
| `RESEND_API_KEY` | `send-email`, `dispatch-newsletter`, etc. |
| `PROCESS_SCHEDULED_MESSAGES_SECRET` | `process-scheduled-messages`, dispatch interno |
| `TRIGGER_AUTOMATIONS_SECRET` | `trigger-automations` |
| `INTEGRATION_GATEWAY_SECRET` | `integration-gateway` (`x-webhook-secret`) |
| `WEBHOOK_CART_SECRET` | `webhook-cart` |
| `FLOW_ENGINE_SECRET` | `flow-engine` / encadeamento interno |

**Recomendados** (conforme funções ligadas): `RESEND_DEFAULT_FROM`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `DISPATCH_NEWSLETTER_INTERNAL_SECRET`, `WHATSAPP_WEBHOOK_SECRET`, `SMS_DEV_TOKEN`, `LOGTAIL_SOURCE_TOKEN`.

## Health Checks rápidos

1. `unsubscribe-contact`
   - Deve rejeitar request sem `ts/sig` válidos.
2. `conversion-attribution`
   - Deve retornar `401` sem `Authorization` de service role ou `x-attribution-secret`.
3. `process-scheduled-messages`
   - Deve rejeitar execução sem segredo interno/autorização.
4. `trigger-automations`
   - Deve rejeitar execução sem segredo interno/autorização.
5. Dashboard
   - Rotas com `requiredPlan` devem negar acesso quando `profile` estiver indisponível.

## Smoke manual (usuários reais)

1. Signup → sessão ativa → redirecionamento esperado (`docs/staging-go-no-go.md`).
2. Login → `/dashboard` sem loop de auth.
3. Recuperação de senha: e-mail recebido e link abre `/reset-password` no host correto.

Se **não** estiver em beta limitado, execute também os fluxos estendidos em `docs/staging-go-no-go.md` (inbox, webhook-cart, multi-tenant).

## Go/No-Go mínimo

- CI verde (`lint`, `test`, `build`, `release:check`).
- Migrations aplicadas sem erro (incl. `client_error_events` se usar observabilidade de cliente).
- Segredos obrigatórios definidos no Supabase + env do frontend.
- Fluxos críticos com autenticação validados (Dashboard Auth e smoke manual acima).

## Alertas HTTP 5xx

- Supabase não envia alertas nativos só pelo Explorer; use **Log Drains** (Pro+) + regra no destino. Ver `docs/observability-alerts.md` seção 6.
