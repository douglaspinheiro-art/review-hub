
## Reformular fluxo Signup → Dashboard com paywall pós-Resultado

### Decisão estratégica
- "Trial grátis" = chegar até `/resultado` (diagnóstico). Sem janela de dashboard grátis.
- `/setup` e `/dashboard/*` exigem **plano pago ativo** (`profile.plan` ∈ {growth, scale, enterprise}).
- `starter` passa a ser **plano pago** acessível via checkout — não é mais o "default grátis". Quem só viu o diagnóstico fica numa flag intermediária.

### Modelo de estado (sem migração nova, reaproveita o existente)
Reutilizar `profiles.plan` + adicionar coluna `profiles.subscription_status` com valores:
- `diagnostic_only` (default pós-signup) — viu diagnóstico, sem pagamento
- `active` — assinatura paga ativa
- `past_due` / `canceled` — gerenciado pelo webhook Stripe/MP existente

E `profiles.onboarding_completed` (já existe) marcado ao terminar `handleFinish`.

> **Migração necessária:** adicionar coluna `subscription_status text default 'diagnostic_only'` em `profiles`. Webhook Stripe/MP existente passa a setar `'active'` no checkout.success.

### Mudanças por camada

**1. Guard de rota (`ProtectedRoute.tsx`)**
Nova prop `requirePaidSubscription?: boolean`. Se `true` e `profile.subscription_status !== 'active'`, redireciona para `/planos?recommended=<tier>&from=diagnostico`. Aplicar em `/setup` e em **todas** as rotas `/dashboard/*` (alterar `DashboardRoute` no `App.tsx` para incluir o guard por padrão).

**2. `/resultado` — virar página de venda**
- Trocar CTAs "Continue Setup" → **"Ativar plano [recomendado] →"** que leva para `/planos?recommended=<tier>&from=diagnostico`.
- Adicionar bloco "Plano recomendado para sua loja" antes do CTA final, citando CHS e perda mensal.
- Manter rota acessível após login se já houver diagnóstico (sem guard de pagamento).

**3. `/planos` — aceitar query params**
- Ler `?recommended=` e `?from=diagnostico` via `useSearchParams`.
- Destacar visualmente o cartão recomendado (badge "Recomendado para você") e mostrar banner no topo: "Com seu CHS [X], o plano [Y] cobre o gargalo principal."
- Quando `from=diagnostico`, esconder/desabilitar Starter ou destacar Growth como entrada.

**4. Regra de recomendação (v1, helper puro)**
Novo `src/lib/plan-recommendation.ts`:
```
chs < 40  || perda_mensal > 50_000  || problemas_criticos >= 2  → "growth"
chs < 25  || perda_mensal > 200_000                             → "scale"
default                                                         → "growth"
```
(Sem `starter` como recomendação default — tier de entrada é Growth pós-diagnóstico.)

**5. `Onboarding.tsx` `handleFinish`**
Após gravar `funnel_metrics`, fazer `update profiles set onboarding_completed = true, subscription_status = coalesce(subscription_status, 'diagnostic_only')`. Garante consistência.

**6. Persistência funil para `Analisando.tsx`**
Em `Analisando.tsx`, se `sessionStorage.ltv_funnel_data` ausente, ler último registo de `funnel_metrics` por `user_id` (já existe). SessionStorage vira cache.

**7. Nome inicial da loja**
Solução B (mais simples): alterar trigger SQL `handle_new_user_store` para usar `COALESCE(company_name, full_name, email-prefix, 'Minha Loja')`. **Migração necessária.**

**8. Localização PT**
Traduzir `Resultado.tsx`, `Analisando.tsx` (steps), `Setup.tsx` (toasts) — copy 100% PT-BR.

**9. Login pós-signup — "próximo passo" centralizado**
Helper `getNextStep(profile, hasDiagnostic)`:
- sem `onboarding_completed` → `/onboarding`
- `onboarding_completed` && sem diagnóstico → `/analisando`
- com diagnóstico && `subscription_status !== 'active'` → `/resultado`
- `active` → `/dashboard`

Aplicar em `Login.tsx` (após login), `Signup.tsx` (se já autenticado), `Onboarding.tsx` (gate de entrada).

**10. Billing/Stripe webhook**
Atualizar `supabase/functions/stripe-webhook` (a criar — não existe ainda) ou `mercadopago-webhook` para setar `subscription_status = 'active'` em `profiles` no `checkout.session.completed` / `payment.approved`. Manter `plan` como hoje.

### Ordem de execução
1. Migração SQL: `subscription_status` em `profiles` + alterar trigger `handle_new_user_store`.
2. Helper `plan-recommendation.ts` + `getNextStep` + tradução PT.
3. `Resultado.tsx` (CTAs venda) + `Planos.tsx` (query params + destaque).
4. `ProtectedRoute` (`requirePaidSubscription`) + aplicar em `/setup` + `DashboardRoute`.
5. `Onboarding.handleFinish` (marca `onboarding_completed`) + `Analisando.tsx` fallback DB.
6. `Login.tsx` / `Signup.tsx` usar `getNextStep`.
7. Webhook pagamento → `subscription_status = 'active'`.

### Arquivos tocados
- `src/components/ProtectedRoute.tsx`
- `src/App.tsx` (DashboardRoute, /setup)
- `src/pages/Resultado.tsx`, `Planos.tsx`, `Analisando.tsx`, `Onboarding.tsx`, `Setup.tsx`, `Login.tsx`, `Signup.tsx`
- `src/lib/plan-recommendation.ts` (novo), `src/lib/next-step.ts` (novo)
- `supabase/migrations/<ts>_subscription_status_and_store_name.sql` (novo)
- `supabase/functions/mercadopago-webhook/index.ts` (set `subscription_status`)

### Fora de escopo (próxima iteração)
- Persistir `recommended_plan` em `diagnostics_v3` (v2 da regra).
- Eliminar `trial_ends_at` legacy (deixa coexistir).
- A/B do copy de venda em `/resultado`.
