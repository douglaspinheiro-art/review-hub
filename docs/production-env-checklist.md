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
- `VITE_ENABLE_DIAGNOSTICO_ANALYTICS` (opcional)
  - Defina `true` apenas se quiser enviar eventos sem PII do wizard `/diagnostico` para `window.dataLayer` (ex.: integração GTM). Ao usar GA/Pixel ou outros trackers nesse fluxo, atualize política de cookies/LGPD e opt-out. Implementação: `src/lib/analytics-events.ts`.

### Edge `fetch-store-metrics`

- Faça deploy da função em produção para o simulador `/diagnostico` pré-preencher métricas quando houver integração e-commerce ativa (`integrations`). Erros 404/401/422 são tratados na UI; JWT do utilizador é enviado no `invoke`.

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
| `CONVERSION_ATTRIBUTION_SECRET` | `conversion-attribution` (header `x-attribution-secret` ou Bearer service role) |
| `ATTRIBUTION_WINDOW_HOURS` (opcional) | `conversion-attribution` — janela last-touch em horas; padrão **72**, alinhado a `src/lib/attribution-config.ts` e à cópia da área de Atribuição no dashboard. Defina o mesmo valor em produção para o cálculo na edge coincidir com o comunicado na UI. |
| `RESEND_API_KEY` | `send-email`, `dispatch-newsletter`, etc. |
| `PROCESS_SCHEDULED_MESSAGES_SECRET` | `process-scheduled-messages`, dispatch interno |
| `TRIGGER_AUTOMATIONS_SECRET` | `trigger-automations` |
| `INTEGRATION_GATEWAY_SECRET` | `integration-gateway` (`x-webhook-secret`) |
| `WEBHOOK_CART_SECRET` | `webhook-cart` |
| `FLOW_ENGINE_SECRET` | `flow-engine` / encadeamento interno |

**Recomendados** (conforme funções ligadas): `RESEND_DEFAULT_FROM`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `DISPATCH_NEWSLETTER_INTERNAL_SECRET`, `WHATSAPP_WEBHOOK_SECRET`, `SMS_DEV_TOKEN`, `LOGTAIL_SOURCE_TOKEN`.

**WhatsApp Cloud API (Meta)** — se não usar Evolution e sim `provider = meta_cloud`: `META_WHATSAPP_VERIFY_TOKEN` (webhook GET challenge) e `META_APP_SECRET` (assinatura `X-Hub-Signature-256`). Deploy: `meta-whatsapp-webhook`, `meta-whatsapp-send`. Guia: `docs/meta-whatsapp-cloud-setup.md`.

## Health Checks rápidos

1. `unsubscribe-contact`
   - Deve rejeitar request sem `ts/sig` válidos.
2. `conversion-attribution`
   - Deve retornar `401` sem `Authorization` de service role ou `x-attribution-secret`.
   - **Origem dos registos:** a função insere em `attribution_events` com `source_platform = last_touch_send`, distinto dos upserts do `integration-gateway` (ex.: `shopify`, `nuvemshop` com cupom/UTM). A deduplicação usa `(user_id, order_id, source_platform)`, por isso o mesmo pedido pode ter um evento “e-commerce” e outro “último envio CRM” sem colisão.
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

## Billing, plano e RLS (simulador e prescrições)

1. **`profiles` e RLS**
   - Em instalações com `phase1-migration` / `profiles_own`, o utilizador só acede a `profiles` onde `auth.uid() = id` (select/update). Confirmar no **SQL Editor** que não existem policies permissivas extra em produção.
   - O simulador em `/dashboard/diagnostico` pode fazer `update` de `plan` e `onboarding_completed` no cliente: isso é adequado para **onboarding**, mas não deve substituir o **plano de subscrição** pago.

2. **Stripe (ou outro PSP) como fonte de verdade**
   - Limites de produto (Growth, Scale, etc.) devem refletir o estado da subscrição no webhook (ex.: `customer.subscription.updated`). O campo `profiles.plan` pode ficar desalinhado se o utilizador escolher um plano no wizard sem concluir pagamento; tratar no backend ou reconciliar no login.

3. **`stores`**
   - Inserção no simulador usa `user_id = auth.uid()`. Garantir policy `stores` alinhada ao modelo actual (`store_id` multi-tenant vs `user_id` dono).

4. **`prescriptions`**
   - Estados (`aguardando_aprovacao`, `aprovada`, `em_execucao`, `concluida`) dependem de escrita pela app e/ou jobs. Validar triggers ou edge que avançam estados após `dispatch-campaign`, para evitar listas vazias ou prescrições “presas”.
   - **Checklist SQL (read-only no Editor, com `limit`)**
     - `select id, status, store_id, updated_at from prescriptions where store_id = '<uuid>' order by updated_at desc limit 50;` — confirmar transições coerentes após aprovar e disparar campanha.
     - Políticas RLS em `prescriptions`: o colaborador só vê linhas da loja (`store_id` / `user_id` do dono) conforme o modelo actual; o proprietário consegue `select/update` nas linhas esperadas.
     - Se existir job/cron que fecha prescrições: confirmar logs da função e que `status = concluida` quando `campaigns.status` passa a `completed` (ou regra equivalente documentada no vosso backend).

5. **Contatos — export CSV**
   - A app exporta só a página (50 linhas) com consentimento no diálogo. Exportação assíncrona da base completa exige função dedicada (fila, rate limit, URL assinada) — não está ligada por defeito; tratar como roadmap B2B se for requisito comercial.

## Go/No-Go mínimo

- CI verde (`lint`, `test`, `build`, `release:check`).
- Migrations aplicadas sem erro (incl. `client_error_events` se usar observabilidade de cliente).
- Segredos obrigatórios definidos no Supabase + env do frontend.
- Fluxos críticos com autenticação validados (Dashboard Auth e smoke manual acima).

## Alertas HTTP 5xx

- Supabase não envia alertas nativos só pelo Explorer; use **Log Drains** (Pro+) + regra no destino. Ver `docs/observability-alerts.md` seção 6.
