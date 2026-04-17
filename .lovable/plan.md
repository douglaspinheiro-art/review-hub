
## Objetivo

Transformar `/resultado` em uma página de **conversão direta**: mostrar diagnóstico + planos + checkout inline, sem redirecionar para `/planos`. E garantir que usuários que voltam (sem ter comprado) caiam direto no `/resultado` em vez de refazer o diagnóstico.

## Contexto atual

- `/resultado` hoje: mostra diagnóstico + bloco "Plano recomendado" com botão que faz `navigate("/planos?...")`.
- Checkout: `mercadopago-create-preference` já existe e retorna `init_point` (URL do Mercado Pago).
- Login: após login, usuário vai para `/onboarding` (via `useAuth`/Login.tsx).

## Mudanças

### 1. `/resultado` — Checkout inline

Substituir o bloco atual "Plano recomendado" por:

- **3 cards de planos** (Starter / Growth / Scale) lado a lado, com o `recommendation.tier` destacado (ring emerald + badge "Recomendado para você").
- Toggle **Mensal / Anual** no topo dos cards.
- Cada card tem botão "Assinar [Plano]" que:
  1. Chama `supabase.functions.invoke("mercadopago-create-preference", { body: { plan_key, billing_cycle } })`.
  2. Recebe `init_point` e abre em nova aba (`window.open(init_point, "_blank")`) — ou redireciona na mesma aba.
  3. Estado de loading no botão durante a chamada.
- Mantém o copy de "Por que esse plano" usando `recommendation.reason`.
- Mantém o bloco "isActive" (usuário já assinante → vai pro dashboard).

### 2. Roteamento pós-login → `/resultado` se houver diagnóstico pendente

Atualmente `Login.tsx` redireciona para `/onboarding` ou `/dashboard`. Adicionar lógica:

- Após login bem-sucedido, **se** `profile.subscription_status !== "active"` **e** existe registro em `diagnostics_v3` para o `user_id` → `navigate("/resultado")`.
- Caso contrário, fluxo atual (onboarding/dashboard).

Implementação: pequeno helper `getPostLoginRoute(userId, profile)` que faz um SELECT rápido em `diagnostics_v3` e decide.

### 3. Mesma lógica em `/` (Index) e `/onboarding`

Se um usuário logado com diagnóstico mas **sem assinatura** acessar `/` ou `/onboarding`, redirecionar pra `/resultado`. Isso garante "se sair sem comprar e voltar, vê a página de resultado".

Implementação mínima: hook `usePendingDiagnostic()` montado em Index e Onboarding que faz o redirect.

### 4. Manter `/planos` acessível

Botão secundário "Comparar todos os planos" continua existindo no rodapé do `/resultado` (já existe). Não removemos `/planos`.

## Arquivos afetados

- `src/pages/Resultado.tsx` — adicionar grid de 3 planos + checkout inline + toggle billing.
- `src/pages/Login.tsx` — usar `getPostLoginRoute`.
- `src/pages/Index.tsx` — redirect se logado + diagnóstico + sem assinatura.
- `src/pages/Onboarding.tsx` — mesmo redirect.
- `src/lib/post-login-route.ts` (novo) — helper único reutilizado.

## Detalhes técnicos

- Checkout: usar `init_point` (produção) com fallback para `sandbox_init_point` se em dev.
- Tracking: manter `trackFunnelEvent({ event: "checkout_started", ... })` antes do `window.open`.
- Plano recomendado: o card recomendado fica destacado mas usuário pode escolher qualquer um (autonomia).
- Annual toggle: usa preços já em `PLANS` (`base` mensal, `annualMonthly` anual) — verificar `pricing-constants.ts` antes de implementar; se não houver `annualMonthly`, calculo simples `base * 0.8`.

## Fora de escopo

- Não mexer em `/planos` (continua igual, com sua própria lógica de checkout).
- Não criar nova edge function — `mercadopago-create-preference` já cobre.
