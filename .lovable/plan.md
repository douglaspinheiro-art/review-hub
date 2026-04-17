
User is asking what to do next after completing all 4 fronts of the audit follow-up (regression tests, RLS hardening, observability, status matrix). System is hardened. Now I should propose what comes after multi-tenant hardening — production readiness, growth, or product polish.

Logical next directions:
1. **Production go-live validation** — run audit queries (`list_integrations_audit`, `list_channels_audit`) against real data, validate Stripe webhook + cron secrets, smoke E2E in staging
2. **Apply order-payment-status everywhere** — the new helper exists but normalize-webhook.ts may not use it yet end-to-end; align webhook-orders/refunds/integration-gateway to call `isOrderPaid()` directly
3. **Fix existing TS/lint debt** — `docs/lint-debt-reduction.md` exists, suggests technical debt
4. **Observability dashboards** — surface the audit views in an admin UI page (`/admin`) so non-SQL operators can see RLS denials and webhook rejection reasons
5. **Loja Integrada decision** — was removed in Fase A, decide permanent removal vs reimplementation

Best to present concise prioritized list, ask which to pursue.
