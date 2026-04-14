

# Integration Architecture — Technical Audit Report (Round 2)

## Summary of Current State

Since the last audit, the following items were **completed**:
- HMAC verification for VTEX, Tray, Yampi
- Exponential backoff with `next_retry_at` on `webhook_queue`
- Parallel webhook processing (concurrency=10)
- Inngest durable execution for webhook jobs
- Magento 2 normalizers (cart + order + refund + metrics fetch)
- `webhook-refunds` edge function
- Tray/Yampi order normalizers
- Paginated metrics fetch (Shopify, WooCommerce, Magento)
- RLS fixes on `membros_loja` and `ai_agent_config`
- Shopee removed from `detectSource`, Magento added
- `integration-gateway` JWT config fixed

## Remaining Items — What This Plan Covers

The user requested 5 specific features:

1. **Shopee normalizer in `detectSource`** — Add Shopee detection + cart/order normalizers
2. **Encrypt integration credentials at rest** — `pgcrypto` encryption for `integrations.config`
3. **Bulk import endpoint for customers** — New edge function for CSV/JSON customer import
4. **Automatic webhook registration helper** — Edge function that registers webhooks on the e-commerce platform via API
5. **Catalog sync via `data-pipeline-cron`** — Pull products/stock from e-commerce APIs into `catalog_snapshot`

---

## Implementation Plan

### 1. Shopee Normalizer

**Files to modify:**
- `supabase/functions/_shared/normalize-webhook.ts` — Add `normalizeShopee()` cart normalizer + Shopee to `detectSource`
- `supabase/functions/webhook-orders/index.ts` — Add `normalizeShopeeOrder()`
- `supabase/functions/webhook-refunds/index.ts` — Add Shopee refund case
- `supabase/functions/fetch-store-metrics/index.ts` — Add `fetchShopee()` metrics fetcher
- `src/lib/ecommerce-platforms.ts` — Add "Shopee" to platform lists
- `supabase/functions/integration-gateway/index.ts` — Add `shopee` to `QueryParamsSchema` enum

**Shopee specifics:**
- Shopee Partner API uses `partner_id` + `partner_key` + `shop_id` + HMAC-SHA256 signature on every request
- Detection: payload has `shop_id` + `order_sn` (Shopee naming convention), or User-Agent contains "Shopee"
- Cart events: Shopee doesn't have native abandoned cart webhooks — orders only. Cart recovery would need polling via `get_escrow_detail` or Shopee's checkout API
- Order webhook: `order_status_update` push notification with `order_sn`, `status`, `buyer_username`

### 2. Encrypt Integration Credentials at Rest

**Database migration:**
- Enable `pgcrypto` extension
- Create `encrypt_integration_config()` and `decrypt_integration_config()` SQL functions using `pgp_sym_encrypt`/`pgp_sym_decrypt` with a server-side key stored in Vault or env var `INTEGRATION_ENCRYPTION_KEY`
- Add a `config_encrypted` column (bytea) to `integrations`
- Create a trigger that auto-encrypts `config` on INSERT/UPDATE into `config_encrypted` and nullifies plaintext `config`

**Files to modify:**
- `supabase/functions/fetch-store-metrics/index.ts` — Decrypt config before use
- `supabase/functions/validate-integration/index.ts` — Decrypt before validation
- `supabase/functions/_shared/normalize-webhook.ts` — `getVerifierSecretForStore` needs to decrypt
- New shared helper: `supabase/functions/_shared/decrypt-config.ts`

**Approach:** Use `pgp_sym_encrypt(config::text, key)` at DB level via trigger so all reads through service role automatically get encrypted data. Edge functions decrypt using a shared helper that calls `pgp_sym_decrypt`.

### 3. Bulk Import Endpoint for Customers

**New file:** `supabase/functions/bulk-import-contacts/index.ts`

**Spec:**
- Auth: JWT (user must be authenticated)
- Input: JSON body with `{ store_id: UUID, contacts: Array<{phone, email?, name?, tags?}> }`
- Max 5,000 contacts per request
- Upserts into `customers_v3` (match on `phone` + `store_id`)
- Also upserts into `contacts` for backward compatibility
- Returns `{ imported: number, skipped: number, errors: Array<{row, reason}> }`
- Rate limited: 10 requests/min per user

**Config:**
- `supabase/config.toml` — Add `[functions.bulk-import-contacts]` with `verify_jwt = true`

### 4. Automatic Webhook Registration Helper

**New file:** `supabase/functions/register-webhooks/index.ts`

**Spec:**
- Auth: JWT (called from dashboard after integration setup)
- Input: `{ store_id: UUID, platform: string }`
- Reads integration credentials from `integrations` table (decrypted)
- Registers webhook URLs on the e-commerce platform via their API:
  - **Shopify:** `POST /admin/api/2024-01/webhooks.json` for topics: `checkouts/create`, `orders/paid`, `orders/fulfilled`, `refunds/create`
  - **WooCommerce:** `POST /wp-json/wc/v3/webhooks` for topics: `order.updated`, `order.created`
  - **Nuvemshop:** `POST /v1/{user_id}/webhooks` for events: `store/order/paid`, `store/order/fulfilled`
  - **VTEX:** Master Data triggers + OMS hook configuration
  - **Yampi:** `POST /webhooks` for order events
  - **Tray:** Webhook registration via admin API
- Stores registered webhook IDs in `integrations.config_json.registered_webhooks`
- Returns success/failure per webhook topic

**Config:**
- `supabase/config.toml` — Add entry with `verify_jwt = true`

### 5. Catalog Sync via `data-pipeline-cron`

**Files to modify:**
- `supabase/functions/data-pipeline-cron/index.ts` — Add `jobCatalog()` function that:
  - For each store with an active e-commerce integration, fetches products via the platform API
  - **Shopify:** `GET /admin/api/2024-01/products.json?fields=id,title,variants,status&limit=250` (paginated)
  - **WooCommerce:** `GET /wp-json/wc/v3/products?per_page=100&page=N`
  - **Nuvemshop:** `GET /v1/{user_id}/products?per_page=200`
  - **Magento:** `GET /rest/V1/products?searchCriteria[pageSize]=100`
  - **Yampi/Tray:** Their respective product endpoints
  - Upserts into `catalog_snapshot` table: `store_id, user_id, sku, product_name, stock_qty, captured_at`
  - Processes in chunks of 10 stores (existing pattern)

**New shared helper:** `supabase/functions/_shared/decrypt-config.ts` (shared with item 2)

---

## Technical Details

### Database Migration Required

```sql
-- 1. Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add encrypted config column
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS config_encrypted bytea;

-- 3. Encryption/decryption functions using server-side key
CREATE OR REPLACE FUNCTION encrypt_integration_config(plain_config jsonb, encryption_key text)
RETURNS bytea AS $$
  SELECT pgp_sym_encrypt(plain_config::text, encryption_key)
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION decrypt_integration_config(encrypted bytea, encryption_key text)
RETURNS jsonb AS $$
  SELECT pgp_sym_decrypt(encrypted, encryption_key)::jsonb
$$ LANGUAGE sql IMMUTABLE;
```

### New Secrets Required
- `INTEGRATION_ENCRYPTION_KEY` — Symmetric key for config encryption

### Files Summary

| Action | File |
|--------|------|
| Modify | `supabase/functions/_shared/normalize-webhook.ts` |
| Modify | `supabase/functions/webhook-orders/index.ts` |
| Modify | `supabase/functions/webhook-refunds/index.ts` |
| Modify | `supabase/functions/fetch-store-metrics/index.ts` |
| Modify | `supabase/functions/integration-gateway/index.ts` |
| Modify | `supabase/functions/data-pipeline-cron/index.ts` |
| Modify | `supabase/config.toml` |
| Modify | `src/lib/ecommerce-platforms.ts` |
| Modify | `scripts/ci/edge-manifest.json` |
| Modify | `scripts/ci/smoke-checks.mjs` |
| Create | `supabase/functions/_shared/decrypt-config.ts` |
| Create | `supabase/functions/bulk-import-contacts/index.ts` |
| Create | `supabase/functions/register-webhooks/index.ts` |
| Migration | Add `config_encrypted`, pgcrypto, encryption functions |

### Execution Order

1. Database migration (pgcrypto + config_encrypted column)
2. Create `decrypt-config.ts` shared helper
3. Shopee normalizers (detect, cart, order, refund, metrics)
4. Encrypt integration credentials (modify fetch-store-metrics, validate-integration, normalize-webhook)
5. Bulk import endpoint
6. Webhook registration helper
7. Catalog sync in data-pipeline-cron
8. Update config.toml, smoke checks, edge manifest

