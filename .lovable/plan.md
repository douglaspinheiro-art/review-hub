
User asks: when a store connects, is it persisted so we don't keep asking to reconnect?

Quick check: integrations table has `is_active`, `last_sync_at`, `config`. Onboarding likely checks this. Let me verify the flow.

The integration IS persisted in `integrations` table (per store + type, with `is_active=true`). The question is whether the Onboarding/Integrações pages re-check this and skip the connection step if already connected.

I'll briefly inspect Onboarding step 2 to confirm the current behavior, then plan.
