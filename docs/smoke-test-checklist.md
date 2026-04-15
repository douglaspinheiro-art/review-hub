# Smoke Test Checklist — Production Readiness

## 1. Auth Flow
- [ ] Signup → profile created in `profiles` + store in `stores`
- [ ] Login → session active, redirect to `/dashboard`
- [ ] Password reset → email sent, `/reset-password` works
- [ ] Logout → session cleared, redirect to `/login`

## 2. Onboarding Flow
- [ ] `/onboarding` step 1 → store info saved
- [ ] Step 2 → `validate-integration` called, credentials validated
- [ ] Step 3 → funnel metrics saved to `funnel_metrics`
- [ ] Step 4 → GA4 test connection works (or skip)
- [ ] Finish → `gerar-diagnostico` called → `/analisando` → `/resultado`
- [ ] `/resultado` displays real diagnostic from `diagnostics_v3`

## 3. Billing (Mercado Pago)
- [ ] `/planos` → shows 3 plans with MP payment methods
- [ ] "Assinar" → `mercadopago-create-preference` returns `init_point`
- [ ] Checkout completes → `mercadopago-webhook` updates `profiles.plan`
- [ ] `TrialGate` blocks paid features when trial expired and unpaid

## 4. WhatsApp Connection
- [ ] `/setup` → Meta Embedded Signup popup opens
- [ ] `meta-wa-oauth` exchanges code → `whatsapp_connections` row created
- [ ] Dashboard shows "WhatsApp conectado" badge

## 5. Campaign Dispatch
- [ ] Create campaign in `/dashboard/campanhas`
- [ ] Select segment → `campaign_segments` row created
- [ ] Dispatch → `dispatch-campaign` → `execute_campaign_segmentation_v4` RPC
- [ ] `scheduled_messages` populated → `process-scheduled-messages` sends via Meta Cloud API
- [ ] Campaign status transitions: draft → running → completed

## 6. Inbox
- [ ] Inbound message via `meta-whatsapp-webhook` → conversation created
- [ ] Message appears in `/dashboard/inbox`
- [ ] Reply sent → `meta-whatsapp-send` called → message delivered

## 7. Automations (Cart Recovery)
- [ ] `webhook-cart` receives cart event → `webhook_queue` row
- [ ] `flow-engine` triggered → `scheduled_messages` created with delay
- [ ] After delay → message sent → cart status updated on recovery

## 8. RFM Segmentation
- [ ] `calculate-rfm` called → `customers_v3` RFM fields populated
- [ ] `/dashboard/rfm` shows real segments from `customers_v3`

## 9. Analytics
- [ ] `analytics_daily` populated via `webhook-orders` + cron
- [ ] `/dashboard/analytics` shows real charts

## 10. Multi-Tenant Isolation
- [ ] User A creates campaign/contact
- [ ] User B cannot see User A's data
- [ ] Cross-tenant API calls return 404/empty

## 11. Security
- [ ] `user_roles` — authenticated users cannot INSERT/UPDATE/DELETE
- [ ] `mp_webhook_events` — authenticated users cannot write
- [ ] `increment_unread_count` — not executable by `anon`
- [ ] Edge functions reject requests without valid auth/secret

## 12. Performance
- [ ] Dashboard loads in < 3s (use `get_dashboard_snapshot` RPC)
- [ ] Campaign dispatch handles 5k+ contacts without timeout
- [ ] Rate limiting works on all critical endpoints
