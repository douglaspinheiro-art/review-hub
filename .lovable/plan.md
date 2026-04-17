

O usuário está em `/resultado` e pergunta se há plano de melhoria. Vou propor melhorias incrementais focadas no que ainda está pendente após o paywall implementado.

## Plano de melhorias — próximas iterações

Foco: fechar pontas soltas do funil e aumentar conversão pós-diagnóstico.

### 1. Persistir recomendação no diagnóstico (v2 da regra)
- Adicionar coluna `recommended_plan` em `diagnostics_v3` via migração.
- Gravar resultado de `recommendPlan()` no momento da geração (edge `gerar-diagnostico`).
- `/resultado` e `/planos` lêem da BD em vez de recalcular no cliente — garante consistência se a regra mudar.

### 2. Limpeza do legacy `trial_ends_at`
- Remover banner "Acesso demonstração" (visto no QA anterior) que ainda lê `trial_ends_at`.
- Migração: dropar coluna ou marcar como deprecated; remover `isTrialActive` do `AuthContext`.
- Atualizar `Billing.tsx` para mostrar apenas `subscription_status`.

### 3. Telemetria do funil pago
- Eventos: `diagnostic_viewed`, `plan_recommended`, `checkout_started`, `checkout_completed`, `paywall_blocked`.
- Dashboard interno (admin) com taxa de conversão diagnóstico → checkout por tier recomendado.
- Permite A/B do copy de venda em `/resultado` na próxima iteração.

### 4. UX do paywall
- Quando guard bloqueia `/dashboard/*`, mostrar **modal explicativo** ("Seu diagnóstico está pronto. Ative seu plano para acessar o dashboard") antes de redirecionar para `/planos` — reduz fricção/confusão.
- Estado vazio em `/dashboard` para usuários `past_due` com CTA de reativação.

### 5. Robustez do webhook Mercado Pago
- Garantir idempotência por `payment.id` (tabela `webhook_events` já existe?).
- Retry/dead-letter para falhas no `update profiles`.
- Logar transição `diagnostic_only → active` em `audit_logs` com `payment_id`.

### 6. E2E Playwright do funil completo
- `signup → onboarding → analisando → resultado → planos` (sem pagamento).
- Mock do webhook MP para validar `diagnostic_only → active → /dashboard`.
- Adicionar ao CI como smoke crítico.

### Ordem sugerida
1. UX do paywall (modal) — quick win, alta percepção
2. Limpeza `trial_ends_at` — remove confusão visual
3. Telemetria — base para decisões futuras
4. Persistir `recommended_plan` — consistência
5. Robustez webhook — resiliência
6. E2E — proteção contra regressão

### Fora deste plano
- A/B do copy `/resultado` (depende de telemetria #3)
- Multi-gateway (Stripe foi removido por decisão)
- Refatorar `pricing-constants` para incluir copy localizado por tier recomendado

Quer que eu execute na ordem proposta, ou prefere priorizar diferente (ex: só #1 e #2 primeiro)?

