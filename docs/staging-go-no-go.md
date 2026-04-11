# Staging Go/No-Go Checklist

## Required flow tests

1. Signup flow
   - `signup -> /analisando -> /resultado -> /dashboard`
   - Expected: user session active, dashboard loads without auth loop.

2. Inbox AI flow
   - Open conversation with inbound message.
   - Trigger AI suggestion, accept suggestion, send outbound.
   - Expected: suggestion appears and message persists in `messages`.

3. Webhook cart flow
   - Send signed request to `webhook-cart` with `x-webhook-secret`.
   - Expected: row in `abandoned_carts` with `cart_value`, `cart_items`, status `pending`.
   - Expected: `flow-engine` call succeeds and queue records are created.

4. Multi-tenant isolation
   - User A creates data (campaign/contact/conversation).
   - User B attempts to read same entities.
   - Expected: no cross-tenant visibility for tenantized tables.

## Security checks

- `increment_unread_count` must not be executable by `anon` or `authenticated`.
- Critical internal functions must reject requests without auth/secret:
  - `flow-engine`
  - `process-scheduled-messages`
  - `webhook-cart` (if secret configured)
  - `integration-gateway` (if secret configured)

## Load sanity

- Run:
  - `k6 run scripts/load/campaign-dispatch.k6.js -e BASE_URL=... -e ANON_KEY=... -e USER_JWT=... -e CAMPAIGN_ID=...`
- Pass criteria:
  - `http_req_failed < 2%`
  - `p95 < 1500ms`

## Decision

- Go: all required flow tests + security checks pass.
- No-Go: any auth bypass, any cross-tenant read, or critical flow break.
