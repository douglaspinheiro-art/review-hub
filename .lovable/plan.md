

# Smoke test completo da plataforma — plano

Como estou em modo plan (read-only), não consigo executar `npm run test` / `tsc` / `build` agora. Aprovando, eu rodo a bateria abaixo no modo default e te entrego o relatório consolidado.

## Escopo

### 1. Static / type checks
- `npx tsc --noEmit` — checagem de tipos em todo o projeto
- `npm run lint:changed` — ESLint nos arquivos tocados nas últimas tarefas

### 2. Smoke files & gates
- `node scripts/ci/smoke-checks.mjs` — valida arquivos críticos (ProtectedRoute, webhooks, edge functions)
- `npm run release:check` — bateria de release readiness

### 3. Unit + integration (Vitest, 92 testes hoje)
- `npm run test` em modo único
- Foco esperado:
  - `ProtectedRoute.test.tsx` (já cobre `pending_activation` indiretamente via `requiredPlan`)
  - `Dashboard smoke suite` (renders sem `ReferenceError`)
  - `useConvertIQ`, `useAiAgentConfig`, `attribution-scope`, `funnel-validation`, `dispatch-newsletter-client`, `campaign-dispatch-status`, `review-metrics`, etc.

### 4. Edge functions (Deno)
- `supabase functions test` (via `supabase--test_edge_functions`) nos shared:
  - `_shared/inject-utm.test.ts`
  - `_shared/order-payment-status.test.ts`
  - `_shared/normalize-webhook.test.ts`
  - `meta-wa-oauth/oauth_test.ts`

### 5. Build de produção
- `npm run build` (Vite) — confirma tree-shake + chunks ok com as mudanças de Pixel/PendingActivation/Admin

### 6. Supabase linter
- `supabase--linter` — pega RLS desabilitada / policies abertas após as migrations novas (`pending_activation`, `admin_get_pending_activations`)

### 7. Verificações pontuais (read-only) que já vou fazer agora
- Conferir o warning de `forwardRef` no `ProtectedRoute` que apareceu no console (`Function components cannot be given refs`) — provavelmente vindo do `<Navigate>` dentro de `<Suspense>`. Vou inspecionar e listar como achado, não corrijo no plan.
- Conferir se `MetaPixelTracker` está montado dentro do `<Router>` (pra `useLocation` funcionar) e se não quebra SSR/hydration.
- Conferir se a tela `PendingActivationScreen` cobre o caso de `profile` sem `plan` definido.

### 8. E2E (opcional, mais lento ~3 min)
- `npm run test:e2e` (Playwright) — `smoke-routes.spec.ts` + `critical-flows.spec.ts` + `funnel-paywall.spec.ts`
- Só rodo se você quiser; aumenta bastante o tempo.

## Entregáveis

- Tabela final: cada bateria → ✅/❌ + tempo + nº de testes
- Lista de achados (warnings, flakes, regressões) com arquivo + linha
- Se houver falha vermelha, paro e te mostro antes de tentar corrigir

## Pergunta rápida antes de seguir

Quer que eu inclua o **E2E Playwright** (etapa 8) na bateria? Ele custa ~3 min a mais mas valida `/login`, `/`, `/signup`, dashboard auth e checkout de campanha de ponta a ponta.

Sem ajustes na sua resposta, eu rodo **etapas 1–7** (sem Playwright) ao aprovar.

