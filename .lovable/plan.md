

# Integration Architecture — Technical Audit Report

## Integration Maturity Summary

| Dimension | Rating |
|---|---|
| **Integration maturity** | **Beta** (solid foundation, gaps in polling/sync and observability) |
| **Multi-platform readiness** | **High** (8 platforms with normalizers, extensible pattern) |
| **Magento 2 compatibility** | **Partial** (cart + order normalizers exist; no HMAC verification, no metrics fetcher, no polling) |
| **Data completeness** | **High** for carts/orders; **Low** for products/catalog sync and customer import |
| **Main risks** | Single-threaded worker, no backpressure, HMAC gaps for VTEX/Tray/Yampi/Magento |
| **Primary bottleneck** | `process-scheduled-messages` serial loop as sole webhook worker |

---

## STEP 1 — Architecture Analysis

**Model:** Webhook-first (push), with optional polling via `fetch-store-metrics` (pull for diagnostics only).

**Data flow:**
```text
E-commerce Platform
       │
       ▼  (POST webhook)
┌──────────────────┐     ┌──────────────────┐
│ webhook-cart     │     │ webhook-orders   │
│ integration-gw   │     │                  │
└──────┬───────────┘     └──────┬───────────┘
       │ normalize + enqueue    │ normalize + atomic upsert
       ▼                        ▼
┌──────────────────┐     ┌──────────────┐
│  webhook_queue   │     │  orders_v3   │
│  (Postgres)      │     │  customers   │
└──────┬───────────┘     └──────┬───────┘
       │ cron poll               │ immediate
       ▼                        ▼
┌──────────────────┐     ┌──────────────┐
│ process-scheduled│     │ flow-engine  │
│ -messages worker │     │ (journeys)   │
└──────────────────┘     └──────────────┘
```

**Multi-tenant:** `store_id` scoping on all tables, RLS enforced via `auth_row_read_user_store` / `auth_row_write_user_store` helper functions. Rate limiting is per `store_id:ip`.

**Strengths:**
- Normalization happens BEFORE enqueuing (fixes prior 100% dead-letter issue)
- Shared `normalize-webhook.ts` module with 8 platform normalizers
- Per-store HMAC verification for Shopify/WooCommerce/Nuvemshop
- Idempotent upserts via `(store_id, external_id)` unique constraint
- Atomic RPC `upsert_cart_with_customer` / `upsert_order_with_customer` prevents orphaned records
- Circuit breaker pattern for external APIs
- Dead-letter queue with configurable max attempts
- pg_cron for pruning completed/dead_letter rows

**Risks:**
- Webhook queue is a Postgres table, not a dedicated queue (advisory locks mitigate but don't eliminate contention)
- Single worker function processes all queues sequentially
- No webhook delivery retry from the platform side (only internal retry on processing failure)

---

## STEP 2 — Platform Compatibility

| Platform | Cart Normalize | Order Normalize | HMAC Verify | Metrics Fetch | Validate Creds | Status |
|---|---|---|---|---|---|---|
| **Shopify** | ✅ | ✅ | ✅ | ✅ | ✅ | Production-ready |
| **WooCommerce** | ✅ | ✅ | ✅ | ✅ | ✅ | Production-ready |
| **Nuvemshop** | ✅ | ✅ | ✅ | ✅ | ✅ | Production-ready |
| **VTEX** | ✅ | ✅ | ❌ | ✅ | ✅ | Missing HMAC |
| **Tray** | ✅ | ✅ (via custom) | ❌ | ✅ | ✅ | Missing HMAC, weak order normalizer |
| **Yampi** | ✅ | ✅ (via custom) | ❌ | ❌ | ❌ | Cart only; no order/metrics/validate |
| **Magento 2** | ✅ | ✅ | ❌ | ❌ | ✅ | No HMAC, no metrics fetch |
| **Shopee** | ❌ | ❌ | ❌ | ❌ | ❌ | Detected in source but no normalizer |

### Magento 2 Compatibility Check

**What exists:**
- `normalizeMagento()` in `normalize-webhook.ts` — maps `entity_id/quote_id`, `billing_address.telephone`, `customer_firstname/lastname`, `items[].{sku, name, qty, price}`, `grand_total`, `discount_amount`, `shipping_amount`
- `normalizeMagento2Order()` in `webhook-orders/index.ts` — handles `increment_id`, `status/state`, `payment.method`
- `detectSource()` detects Magento via `customer_firstname` or `billing_address.telephone`
- `testMagento()` in `validate-integration` — tests `/rest/V1/store/storeConfigs`
- `magento` is in the `QueryParamsSchema` enum for `integration-gateway`

**What's missing:**
1. **No HMAC verification** — Magento doesn't use standard HMAC headers. Needs custom verification via observer-specific tokens or OAuth 1.0a signatures
2. **No `fetchMagento()` in `fetch-store-metrics`** — cannot pull diagnostic metrics
3. **No Tray/Yampi-specific order normalizers** in `webhook-orders` — falls through to `normalizeCustomOrder`
4. **No explicit Magento webhook registration documentation** — requires custom Magento module or third-party webhook extension

---

## STEP 3 — Data Coverage

| Data Type | Coverage | Notes |
|---|---|---|
| **Customers** | ✅ Partial | Created on cart/order events only; no bulk import/sync |
| **Orders** | ✅ Full | All platforms normalized, atomic upsert with customer |
| **Cart events** | ✅ Full | Abandoned cart with abandon_step inference, UTM tracking |
| **Products/Catalog** | ⚠️ Minimal | `catalog_snapshot` table exists but only populated by `data-pipeline-cron` (requires manual config) |
| **Inventory** | ⚠️ Minimal | `inventory_status` captured in cart payload but not actively synced |
| **Refunds/Returns** | ❌ Missing | No refund webhook handler |
| **Shipping status** | ⚠️ Partial | `fulfillment_status` captured on order but no dedicated tracking webhook |

**Missing data points:**
- Customer creation independent of orders (bulk customer import)
- Product catalog sync (prices, stock levels, categories)
- Refund/return events for accurate LTV calculation
- Subscription/recurring order tracking

---

## STEP 4 — Data Sync Strategy

**Current:**
- **Real-time (push):** Webhooks for carts and orders → `webhook_queue` → `process-scheduled-messages` (cron-polled worker)
- **On-demand (pull):** `fetch-store-metrics` for dashboard diagnostics (last 30 days, max 250 orders)
- **Cron:** `data-pipeline-cron` for quality snapshots, cohorts, catalog

**Idempotency:** ✅ `(store_id, external_id)` unique index on `webhook_queue` with `ON CONFLICT DO NOTHING`

**Retry logic:** ✅ Configurable `WEBHOOK_MAX_ATTEMPTS` (default likely 3-5), exponential backoff not implemented (instant retry on next cron tick)

**Gaps:**
1. **No exponential backoff** — failed jobs retry immediately on next worker tick, which can hammer a failing downstream
2. **No ordering guarantee** — jobs processed by `created_at ASC` but concurrent workers could process out of order
3. **Polling-based metrics** (`fetch-store-metrics`) only fetches last 30 days, max 250 orders — insufficient for stores with >250 orders/month
4. **No incremental sync cursor** — each metrics fetch starts from scratch

---

## STEP 5 — Failure Scenarios

| Scenario | Current Behavior | Fix Needed |
|---|---|---|
| **API failure (e.g., flow-engine down)** | Job retried up to max_attempts → dead_letter | ✅ Good. Add exponential backoff. |
| **Timeout on webhook receipt** | Deno edge function has 60s default timeout; 256KB payload limit enforced | ✅ Good. |
| **Partial data (missing phone)** | Cart: returns 422. Orders: allows email-only. | ✅ Correct behavior. |
| **Rate limit from platform API** | `fetch-store-metrics` throws, returns 500 to user | ⚠️ Should catch 429 and return friendly message with retry-after |
| **Duplicate webhook delivery** | Idempotent upsert returns 202 "already received" | ✅ Excellent. |
| **Worker crash mid-processing** | Job stays in `processing` status, stuck forever | ⚠️ Stuck job recovery exists (`unstickStaleWebhooks`) but relies on `processed_at` column which may not exist |
| **Supabase outage** | All functions fail; no offline queue | ❌ Complete outage. Expected for managed service. |

---

## STEP 6 — Performance

**Current limits:**
- `webhook_queue` worker processes in serial loop (configurable batch cap via `PROCESS_SCHEDULED_MAX_WEBHOOK_JOBS`, default ~200)
- `fetch-store-metrics` fetches max 250 orders per API call (no pagination loop)
- Rate limit: 120 req/min per store per IP for webhook endpoints

**For large stores (10K+ orders/month):**
- ⚠️ `fetch-store-metrics` will undercount revenue (cap at 250 orders)
- ⚠️ Serial webhook processing creates growing lag if intake > processing rate
- ✅ Indexes exist on `webhook_queue(store_id, status, created_at)` for efficient polling

**Improvements needed:**
1. **Pagination in `fetch-store-metrics`** — loop through all pages for Shopify/WooCommerce
2. **Parallel webhook processing** — process N jobs concurrently (e.g., `Promise.allSettled` with concurrency limit)
3. **Per-store processing isolation** — prevent one noisy store from starving others

---

## STEP 7 — Security

| Area | Status | Notes |
|---|---|---|
| **Webhook auth (blanket)** | ✅ | `x-webhook-secret` with timing-safe comparison |
| **Per-store HMAC** | ⚠️ Partial | Only Shopify/WooCommerce/Nuvemshop; others skip verification |
| **Multi-tenant isolation** | ✅ | `store_id` on all tables, RLS enforced, `user_id` checks |
| **SSRF protection** | ✅ | `assertSafeApiAddress()` blocks loopback, private IPs, metadata endpoints |
| **Token storage** | ⚠️ | Credentials in `integrations.config` (JSONB) — not encrypted at rest beyond Supabase's disk encryption |
| **Rate limiting** | ✅ | Distributed via Postgres RPC (`check_rate_limit_atomic`) |
| **Data leakage** | ✅ | RLS policies prevent cross-tenant reads |

---

## STEP 8 — Scalability (100 e-commerces)

**Concurrent webhook intake:** ✅ Each webhook endpoint is stateless Deno edge function — scales horizontally via Supabase infrastructure.

**Queue processing:** ⚠️ `process-scheduled-messages` is a single cron-triggered function. At 100 stores × ~50 webhooks/day = 5,000 jobs/day. Serial processing at ~500ms/job = ~42 minutes per batch. **Acceptable for MVP but will bottleneck at 500+ stores.**

**Database connections:** ✅ PgBouncer configured (pool_size=15, max_client_connections=200).

**Bottlenecks at scale:**
1. `webhook_queue` table growth — mitigated by pg_cron pruning (30-day retention)
2. Single worker — needs parallel processing or multiple worker instances
3. `api_request_logs` for rate limiting — pruned daily (7-day retention) ✅

---

## STEP 9 — Integration Gaps

1. **No customer bulk import** — Customers only created reactively from cart/order events. Stores migrating from another tool can't import existing customers.
2. **No product catalog sync** — `catalog_snapshot` exists but isn't populated from e-commerce APIs automatically.
3. **No refund/return handling** — Critical gap for accurate LTV and revenue reporting.
4. **Shopee listed in detection but has no normalizer** — will fall through to `custom` which may produce garbage data.
5. **Yampi/Tray order normalizers missing** — fall through to generic `normalizeCustomOrder`.
6. **No webhook registration API** — merchants must manually configure webhook URLs on their platform.
7. **No integration health monitoring** — no dashboard for webhook delivery success rate, processing lag, dead-letter count.

---

## STEP 10 — Required Fixes

### 🔥 Critical (must fix before production)

1. **Add HMAC verification for VTEX, Tray, Yampi** — Currently these platforms bypass signature verification entirely, meaning anyone who knows the `WEBHOOK_CART_SECRET` can inject fake data for any store on these platforms.

2. **Add exponential backoff to webhook retry** — Failed jobs currently retry immediately on next cron tick. A failing downstream (e.g., flow-engine) will be hammered repeatedly. Implement `next_retry_at = now() + (2^attempts * base_delay)` and filter pending jobs by `next_retry_at < now()`.

3. **Add pagination to `fetch-store-metrics`** — Shopify/WooCommerce calls are capped at 250/100 orders. Stores with >250 orders/month get incorrect revenue figures. Implement cursor-based pagination loop.

### ⚡ High

4. **Add dedicated Tray and Yampi order normalizers** in `webhook-orders` — Currently using `normalizeCustomOrder` which may miss platform-specific fields (Tray's nested `Order.total`, Yampi's `cellphone`).

5. **Add `fetchMagento()` to `fetch-store-metrics`** — Use Magento 2 REST API (`/rest/V1/orders?searchCriteria[...]`) to fetch revenue, customers, order count.

6. **Implement parallel webhook processing** — Replace serial `for` loop with `Promise.allSettled` with concurrency limit (e.g., 10 parallel) in `process-scheduled-messages`.

7. **Add refund webhook handler** — Create `webhook-refunds` edge function to track refunds/returns and adjust customer LTV and order status.

8. **Remove Shopee from `detectSource`** or add proper normalizer — Currently detects but produces no meaningful normalization.

### 🧪 Medium

9. **Add integration health dashboard data** — Create RPC that returns per-store: pending queue depth, dead-letter count (last 7d), avg processing latency, last successful webhook timestamp.

10. **Add `next_retry_at` column to `webhook_queue`** — Enables backoff without worker-side logic changes; worker just adds `AND next_retry_at < now()` to its query.

11. **Encrypt integration credentials at rest** — Use `pgcrypto` to encrypt `integrations.config` sensitive fields (tokens, secrets) with a server-side key.

12. **Add customer bulk import endpoint** — Edge function to accept CSV/JSON batch of customers for initial migration.

### 🟢 Low

13. **Add webhook registration helper** — API endpoint that auto-registers webhook URLs on Shopify/Nuvemshop (they support programmatic webhook registration).

14. **Add Magento 2 HMAC verification** — If using a Magento webhook module that supports signatures.

15. **Add catalog sync via `data-pipeline-cron`** — Extend the pipeline to pull product catalog from connected platforms periodically.

---

## Suggested Architecture Improvements

1. **Move from Postgres queue to Inngest for webhook processing** — The infrastructure already exists (`enqueue-inngest-event`, `inngest-serve`). Route webhook jobs through Inngest for durable execution with built-in retry, backoff, and concurrency controls. This is the single highest-impact change.

2. **Implement a Platform Adapter interface** — Formalize the pattern already emerging in the code:
```text
interface PlatformAdapter {
  normalizeCart(payload): NormalizedCartPayload
  normalizeOrder(payload): NormalizedOrder
  verifySignature(req, body, secret): boolean
  fetchMetrics(config): StoreMetrics
  validateCredentials(config): ValidationResult
  registerWebhooks?(config, urls): void
}
```
Each platform implements this interface. This eliminates the switch statements scattered across 4+ edge functions.

3. **Add a webhook intake buffer** — Instead of normalizing in the webhook handler (which adds latency to the response), store raw payload + metadata and respond 202 immediately. Normalize in the worker. This reduces webhook timeout risk for complex payloads.

