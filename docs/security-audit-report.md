# Security Audit Report — 2026-04-15

## Fixed (this session)

| Issue | Severity | Resolution |
|---|---|---|
| `mp_webhook_events` lacks write protection | ERROR | Added deny INSERT/UPDATE/DELETE policies for `authenticated` |
| `user_roles` privilege escalation | ERROR | Added deny INSERT/UPDATE/DELETE policies for `authenticated` — only service role can modify |
| `membros_loja` no write policies | ERROR | Added owner-only INSERT/UPDATE/DELETE policies |
| `stripe_webhook_events` no policies | ERROR | Added deny-all for `authenticated` |
| `resend_webhook_events` no policies | WARN | Added deny-all for `authenticated` |

## Remaining (requires manual action in Supabase Dashboard)

| Issue | Severity | Action Required |
|---|---|---|
| 12× Security Definer Views | ERROR | These are views created with `SECURITY DEFINER`. Convert to `SECURITY INVOKER` in Supabase SQL Editor. Run: `ALTER VIEW <view_name> SET (security_invoker = on);` for each view. |
| 23× Function Search Path Mutable | WARN | Add `SET search_path = public` to each function. Low risk but best practice. |
| 2× Extension in Public | WARN | Move `pg_trgm` and `pgcrypto` to a dedicated `extensions` schema via Dashboard. |
| Leaked Password Protection Disabled | WARN | Enable in Dashboard → Authentication → Settings → Password Protection. |
| `whatsapp_connections.meta_access_token` readable by team | WARN | Consider column-level security or encrypting tokens at rest. |
| `integrations.config_json` readable by all team members | WARN | Restrict credential columns to admin-role team members. |
| `sms_connections` API keys in plaintext | WARN | Encrypt with pgcrypto or use vault. |
| `store_benchmarks` readable by all authenticated | INFO | Intentional for aggregate data — verify no PII. |

## Multi-Tenant Isolation Status

All tenant-scoped tables use `auth_row_read_user_store()` / `auth_row_write_user_store()` or direct `auth.uid() = user_id` checks. Cross-tenant reads are prevented by RLS.

Key tables verified:
- ✅ `campaigns` — store-scoped RLS
- ✅ `contacts` — store-scoped RLS
- ✅ `conversations` — contact-scoped RLS (joins to store)
- ✅ `customers_v3` — store-scoped RLS
- ✅ `abandoned_carts` — store-scoped RLS
- ✅ `analytics_daily` — store-scoped RLS
- ✅ `whatsapp_connections` — store-scoped RLS
- ✅ `integrations` — store-scoped RLS

## Edge Function Auth Summary

| Function | Auth Method |
|---|---|
| `dispatch-campaign` | JWT + `DISPATCH_CAMPAIGN_SECRET` for internal |
| `flow-engine` | `FLOW_ENGINE_SECRET` only (internal) |
| `webhook-cart` | `WEBHOOK_CART_SECRET` + platform HMAC |
| `integration-gateway` | `INTEGRATION_GATEWAY_SECRET` |
| `mercadopago-webhook` | `x-signature` header validation |
| `meta-whatsapp-webhook` | `META_WHATSAPP_VERIFY_TOKEN` |
| `process-scheduled-messages` | `PROCESS_SCHEDULED_MESSAGES_SECRET` |
