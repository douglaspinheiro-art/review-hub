

## Diagnóstico

Olhando `src/lib/next-step.ts`, a regra está correta:
```
active → /dashboard
```

Mas o problema provável: usuários com plano ativo estão sendo enviados para `/analisando` (que vem antes da checagem de assinatura na cadeia). Isso só aconteceria se `hasDiagnostic = false` — ou seja, a query de `diagnostics_v3` falha/retorna vazio mesmo para quem já tem.

Preciso verificar dois pontos:

1. **`Analisando.tsx`** — ele tem fallback de 25s que sempre vai pra `/resultado`, sem checar se o user já é pago.
2. **`Login.tsx` / `Signup.tsx`** — para onde redirecionam após autenticar.
3. **`getPostLoginRoute`** — só consulta `diagnostics_v3`, não considera que paid users devem pular tudo.

A correção mais limpa: em `getNextStep`, **se `subscription_status === "active"`, vai direto para `/dashboard`** — independente de onboarding/diagnóstico. Quem pagou não deveria ser barrado por etapas anteriores.

## Plano

### 1. `src/lib/next-step.ts`
Adicionar short-circuit no topo: se `profile.subscription_status === "active"` → retorna `/dashboard` imediatamente, antes de checar onboarding/diagnóstico.

```ts
export function getNextStep({ profile, hasDiagnostic }: NextStepInput): NextStepRoute {
  if (!profile) return "/onboarding";
  // Paid users skip funnel — go straight to dashboard.
  if (profile.subscription_status === "active") return "/dashboard";
  if (!profile.onboarding_completed) return "/onboarding";
  if (!hasDiagnostic) return "/analisando";
  return "/resultado";
}
```

### 2. `src/pages/Analisando.tsx`
Guard no topo do `useEffect`: se o usuário já é `subscription_status === "active"`, redireciona imediatamente para `/dashboard` (cobre o caso de alguém colar a URL ou ficar preso aqui).

### 3. `src/pages/Login.tsx`
Verificar e garantir que após `signIn` chama `getPostLoginRoute()` (em vez de hardcoded `/dashboard` ou `/onboarding`). Se já estiver fazendo isso, a mudança em #1 resolve sozinha.

## Arquivos afetados

- `src/lib/next-step.ts` — adicionar short-circuit para `active`
- `src/pages/Analisando.tsx` — guard de redirecionamento para paid users
- `src/pages/Login.tsx` — verificar/ajustar redirect pós-login (se necessário)

## Resultado esperado

Login com plano ativo → `/dashboard` direto, sem passar por `/analisando` nem `/resultado`. Funciona mesmo se o profile não tiver `onboarding_completed = true` ou diagnóstico salvo.

