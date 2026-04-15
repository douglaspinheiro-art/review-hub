

# Plano: Plataforma 100% Funcional para E-commerces Reais

## Mudança Principal vs. Plano Anterior
Stripe substituído por **Mercado Pago Checkout Transparente** (Cartão, PIX, Boleto, Carteira ML).

---

## Fase 1 — Limpeza de Código Morto (2-3 dias)

### 1.1 Eliminar `mock-data.ts` e todas as referências
- Deletar `src/lib/mock-data.ts`
- Limpar imports em: `Canais.tsx`, `EmExecucao.tsx`, `Prescricoes.tsx`, `prescription-map.ts`
- Remover `isDemo = false` residual em `Prescricoes.tsx` e `EmExecucao.tsx` — usar apenas dados reais do Supabase
- Substituir fallback por empty states com CTA ("Configure sua loja para ver dados reais")

### 1.2 Limpar `MOCK_METRICAS` / `MOCK_CONFIG` do ConvertIQ
- Em `useConvertIQ.ts`: remover constantes mock, usar empty state real
- Páginas `ConvertIQ.tsx`, `ConvertIQSetup.tsx`, `ConvertIQDiagnostico.tsx`: sem dados fictícios

### 1.3 Resolver `@ts-nocheck` nos arquivos críticos
- Priorizar: `Onboarding.tsx`, `useDashboard.ts`, `useConvertIQ.ts`
- Regenerar types do Supabase para alinhar com schema real

---

## Fase 2 — Fluxo de Signup → Valor Real (3-4 dias)

### 2.1 Onboarding end-to-end
- Passo 2 (integração obrigatória) → `validate-integration` → `post-integration-setup` (webhooks automáticos)
- Após validação: `fetch-store-metrics` popula dados reais (pedidos, faturamento, contatos)

### 2.2 Diagnóstico com dados reais
- `Analisando.tsx`: alimentar `gerar-diagnostico` com dados da integração (não mock)
- Garantir Edge Function `gerar-diagnostico` deployada com `ANTHROPIC_API_KEY`
- `Resultado.tsx`: exibir diagnóstico real do banco

### 2.3 Setup (WhatsApp) simplificado
- Pós-diagnóstico, skippable
- Meta Embedded Signup como caminho principal

### 2.4 Dashboard first-load
- Com integração ativa: KPIs reais
- Sem dados: `ActivationChecklist` com CTAs claros

---

## Fase 3 — Billing com Mercado Pago (3-4 dias)

**Substituir TODO o fluxo Stripe por Mercado Pago Checkout Transparente.**

### 3.1 Criar Edge Function `mercadopago-create-preference`
- Recebe: `plan_key`, `billing_cycle` (mensal/anual), `user_id`
- Cria preferência de pagamento via API do Mercado Pago (`/v1/preferences` ou `/v1/payments` para checkout transparente)
- Métodos habilitados: **Cartão de crédito, PIX, Boleto bancário, Saldo Mercado Pago**
- Retorna `init_point` ou dados para renderizar checkout transparente no frontend
- Secrets necessários: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`

### 3.2 Criar Edge Function `mercadopago-webhook`
- Recebe notificações IPN/Webhook do Mercado Pago (`verify_jwt = false`)
- Valida assinatura via `x-signature` header + `MERCADOPAGO_WEBHOOK_SECRET`
- Eventos tratados:
  - `payment.approved` → atualiza `profiles.plan`, `profiles.mp_customer_id`, `profiles.mp_subscription_id`
  - `payment.cancelled` / `payment.refunded` → downgrade para `starter`
  - Idempotência via tabela `mp_webhook_events` (similar ao `stripe_webhook_events`)
- Persiste em `mp_webhook_events` para auditoria

### 3.3 Criar Edge Function `mercadopago-subscription` (recorrência)
- Usa API de Assinaturas do MP (`/preapproval`) para planos recorrentes
- Permite criar, pausar e cancelar assinaturas
- Mapeia `preapproval_plan_id` → `plan_tier` via secret `MP_PLAN_TO_TIER`

### 3.4 Migration: adaptar tabelas
- Adicionar colunas em `profiles`: `mp_customer_id`, `mp_subscription_id` (substituindo `stripe_customer_id`, `stripe_subscription_id`)
- Criar tabela `mp_webhook_events` (id, type, payload, created_at)
- Manter colunas Stripe por ora (não deletar, apenas parar de usar)

### 3.5 Refatorar `Billing.tsx`
- Remover `openStripePortal` e toda referência a Stripe
- Novo fluxo: botão "Assinar" → checkout transparente inline (SDK MercadoPago.js)
- Renderizar formulário de cartão, botão PIX (com QR code), botão Boleto — tudo na mesma página
- Status do pagamento: polling via `supabase.from("profiles").select("plan")` ou realtime
- Seção "Gerenciar assinatura": cancelar/pausar via Edge Function

### 3.6 Refatorar `Planos.tsx` e landing `Pricing.tsx`
- CTA "Assinar" → abre checkout transparente (não redireciona para Stripe)
- Badge de método: "Cartão, PIX, Boleto ou Saldo ML"

### 3.7 Atualizar `pricing-constants.ts`
- Trocar `GW_FEE` de 2.5% (Stripe) para taxas do MP:
  - Cartão: 4.99% (ou taxa negociada)
  - PIX: 0.99%
  - Boleto: R$ 3,49/boleto
- Remover referências a Stripe no cálculo de margem

### 3.8 Deletar/desativar código Stripe
- Deletar: `supabase/functions/stripe-billing-portal/index.ts`
- Deletar: `supabase/functions/stripe-webhook/index.ts`
- Deletar: `src/lib/billing/stripe-price-to-plan.ts` + `.test.ts`
- Remover secrets Stripe do `validate-required-env.mjs`
- Adicionar secrets MP: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`, `MP_PLAN_TO_TIER`

### 3.9 Trial enforcement
- `profiles.trial_ends_at` + `isTrialActive` / `isPaid` no AuthContext continuam funcionando
- `TrialGate` expandido para todas as features pagas

---

## Fase 4 — Features Core Funcionais (4-5 dias)

### 4.1 Campanhas WhatsApp
- `dispatch-campaign` envia mensagens reais via Meta Cloud API
- Testar: criar campanha → selecionar segmento → enviar → métricas de entrega

### 4.2 Inbox
- `meta-whatsapp-webhook` recebe mensagens inbound
- Testar: mensagem recebida → Inbox → responder → enviada

### 4.3 Automações (Carrinho Abandonado)
- `webhook-cart` recebe eventos das plataformas integradas
- `flow-engine` processa: 1h WhatsApp → 4h Email → 24h SMS
- Testar end-to-end com loja real

### 4.4 Contatos / RFM
- `calculate-rfm` roda após sync de pedidos
- Página RFM exibe segmentos reais de `customers_v3`

### 4.5 Analytics
- `analytics_daily` populada via `webhook-orders` + cron
- Gráficos de receita, mensagens, contatos — tudo do banco

---

## Fase 5 — Segurança e Estabilidade (2 dias)

### 5.1 RLS audit
- Verificar isolamento multi-tenant (User A ≠ User B)
- Rodar linter do Supabase

### 5.2 Secrets audit
- Todos os secrets de `validate-required-env.mjs` configurados (agora com MP no lugar de Stripe)

### 5.3 Rate limiting
- Edge Functions críticas: `dispatch-campaign`, `ai-agent`, `send-email`, `mercadopago-webhook`

---

## Fase 6 — Testes e Observabilidade (2 dias)

### 6.1 Smoke test do fluxo principal
- Signup → Onboarding → Integração → Diagnóstico → Dashboard → Assinar (MP) → Criar Campanha → Enviar

### 6.2 Monitoring
- Sentry (`error-monitoring.ts`) configurado
- Alertas para falhas em Edge Functions

---

## Resumo de Prioridades

| Prioridade | Item | Impacto |
|---|---|---|
| **P0** | Remover mock data | Credibilidade |
| **P0** | Onboarding → integração → dados reais | Sem isso, nada funciona |
| **P0** | Billing Mercado Pago (checkout transparente) | Receita |
| **P1** | Campanhas WhatsApp e2e | Core value prop |
| **P1** | Webhook cart + automações | Receita automatizada |
| **P1** | RLS audit | Segurança multi-tenant |
| **P2** | @ts-nocheck cleanup | Estabilidade |
| **P2** | Inbox funcional | Feature complementar |
| **P2** | Analytics com dados reais | Retenção |

### Estimativa total: 16-20 dias

### Ordem de execução:
1. Fase 1 (limpeza) — base limpa
2. Fase 2 (signup→valor) — primeiro cliente real entra
3. Fase 3 (Mercado Pago) — pode cobrar
4. Fase 4 (features core) — valor real entregue
5. Fase 5 + 6 (segurança + testes) — escala

### Secrets necessários (Mercado Pago)
| Secret | Onde obter |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Mercado Pago Developers → Credenciais → Access Token (produção) |
| `MERCADOPAGO_PUBLIC_KEY` | Mesma página → Public Key (vai no frontend para SDK JS) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Configuração de webhooks no painel MP |
| `MP_PLAN_TO_TIER` | JSON mapeando IDs de plano MP → tier (ex: `{"plan_abc":"growth"}`) |

