

# Plano: Plataforma 100% Funcional para Usuários Reais

## Estado Atual

Auditoria completa revela que a plataforma está em **~80% de prontidão**. Mercado Pago e mock-data.ts foram resolvidos na sessão anterior. Os bloqueios restantes são concretos e finitos.

---

## Bloco 1 — Remover lógica demo residual (3 arquivos)

**Problema:** `isDemo` ainda existe em `Dashboard.tsx`, `Canais.tsx` e `Prescricoes.tsx` como variáveis que geram branches mortos.

| Arquivo | O que fazer |
|---|---|
| `Dashboard.tsx` (L109, L161) | Remover `const isDemo = searchParams.get("demo") === "true"` e o `if (isDemo)` no `handleSync`. O demo não deve existir em produção. |
| `Canais.tsx` (L120) | Remover `const isDemo = false` e todos os `!isDemo` / `isDemo` condicionais — já são sempre false. |
| `Prescricoes.tsx` (L49) | Idem — `const isDemo = false` é código morto. Limpar todas as referências. |

**Também:** `WhiteLabel.tsx` (L310-316) tem mock inline de clientes de agência. Substituir por query real em `agency_clients` ou empty state.

---

## Bloco 2 — Resolver @ts-nocheck (25 arquivos)

**Problema:** 25 arquivos usam `@ts-nocheck` com a justificativa "Supabase types.ts misaligned". Isso mascara bugs reais.

**Solução:**
1. Regenerar `src/integrations/supabase/types.ts` (automático pelo Lovable ao salvar migration)
2. Remover `@ts-nocheck` de cada arquivo e corrigir erros de tipagem resultantes
3. Priorizar os 10 mais críticos primeiro:
   - `Onboarding.tsx`, `useDashboard.ts`, `Inbox.tsx`, `Dashboard.tsx` referências
   - `Contatos.tsx`, `Campanhas` (CampaignModal), `CarrinhoAbandonado.tsx`
   - `ConvertIQ.tsx`, `ConvertIQDiagnostico.tsx`, `Funil.tsx`
4. Depois os restantes: `Resultado.tsx`, `Setup.tsx`, `Diagnostico.tsx`, `Newsletter.tsx`, `Forecast.tsx`, `AgenteIA.tsx`, `Integracoes.tsx`, `Relatorios.tsx`, `WhatsApp.tsx`, `RFM.tsx`, `Atribuicao.tsx`, `EmExecucao.tsx`, `ContactInfoSidebar.tsx`, `Inbox.test.tsx`, `Billing.tsx` (já sem @ts-nocheck mas referências Stripe no types.ts)

---

## Bloco 3 — Segurança do banco (migration SQL)

**Problemas detectados pelo linter/scanner:**

| Severidade | Problema | Quantidade |
|---|---|---|
| ERROR | Security Definer Views | 12 views |
| WARN | Function search_path mutable | 23 functions |
| ERROR | SMS credentials plaintext (`sms_connections`) | 1 tabela |
| ERROR | Team members privilege escalation | 1 policy gap |
| WARN | Leaked password protection disabled | Dashboard setting |

**Migration a criar:**
1. Converter 12 views para `SECURITY INVOKER`: `ALTER VIEW <name> SET (security_invoker = on);`
2. Adicionar `SET search_path = public` nas 23 functions
3. Restringir `sms_connections` policy de `public` para `authenticated`
4. Adicionar write protection explícita em `membros_loja` (INSERT/UPDATE/DELETE owner-only)

**Ação manual no Dashboard:** Habilitar "Leaked Password Protection" em Authentication > Settings.

---

## Bloco 4 — Secrets faltantes

**Secrets configurados:** Meta WhatsApp (6), Resend, Inngest (2), Lovable API Key.

**Secrets FALTANTES para produção:**

| Secret | Necessário para | Prioridade |
|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Billing / checkout | P0 |
| `MERCADOPAGO_PUBLIC_KEY` | Frontend SDK | P0 |
| `MERCADOPAGO_WEBHOOK_SECRET` | Validar webhooks MP | P0 |
| `MP_PLAN_TO_TIER` | Mapear planos MP → tiers | P0 |
| `ANTHROPIC_API_KEY` | gerar-diagnostico, ai-agent | P0 |
| `CRON_SECRET` | sync-funil-ga4, data-pipeline-cron | P1 |
| `DISPATCH_CAMPAIGN_SECRET` | dispatch-campaign interno | P1 |
| `PROCESS_SCHEDULED_MESSAGES_SECRET` | process-scheduled-messages | P1 |
| `FLOW_ENGINE_SECRET` | flow-engine automations | P1 |
| `WEBHOOK_CART_SECRET` | webhook-cart auth | P1 |
| `INTEGRATION_GATEWAY_SECRET` | integration-gateway | P1 |

**Ação:** Solicitar cada secret via tool `add_secret` com instrução de onde obter.

---

## Bloco 5 — Referências Stripe residuais

Ainda existem menções a Stripe em:
- `src/pages/API.tsx` (L38) — lista de integrações
- `src/pages/Diagnostico.tsx` (L122) — comentário sobre faturação Stripe
- `src/components/landing/Integrations.tsx` (L6) — lista de logos
- `src/integrations/supabase/types.ts` — colunas `stripe_customer_id`, `stripe_subscription_id`, tabela `stripe_webhook_events`

**Ação:** Remover referências no código. As colunas no banco ficam (não deletar por ora, já não são usadas).

---

## Bloco 6 — Deploy de Edge Functions pendentes

As Edge Functions já existem no repo mas precisam estar deployadas. Verificar deploy de:
- `mercadopago-create-preference` (novo)
- `mercadopago-webhook` (novo)
- `dispatch-campaign`, `flow-engine`, `webhook-cart`
- `process-scheduled-messages`, `trigger-automations`
- `gerar-diagnostico`, `ai-agent`, `ai-copy`

Edge Functions deployam automaticamente no Lovable ao salvar — confirmar que todas as pastas existem em `supabase/functions/`.

---

## Bloco 7 — ConvertIQ mock badge

`ConvertIQ.tsx` (L193-299) mostra badge "Dados demonstrativos" quando `source === "none"`. Isso é correto (empty state real, não mock). Apenas garantir que o texto diz "Configure GA4 para ver dados reais" em vez de "dados demonstrativos".

---

## Resumo de Execução

| Bloco | Esforço | Impacto |
|---|---|---|
| 1. Remover isDemo | 30 min | Credibilidade |
| 2. @ts-nocheck (25 files) | 3-4h | Estabilidade, bugs ocultos |
| 3. Security migration | 1h | Multi-tenant safety |
| 4. Secrets | 15 min (config) | Tudo funciona |
| 5. Stripe residual | 15 min | Limpeza |
| 6. Edge deploy | Automático | Funcionalidade |
| 7. ConvertIQ copy | 5 min | UX |

**Estimativa total: 5-6 horas de implementação.**

Após esses 7 blocos + configuração dos secrets no Supabase Dashboard + habilitar leaked password protection, a plataforma estará pronta para receber o primeiro e-commerce real.

