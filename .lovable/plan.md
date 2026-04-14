

# Production-Readiness & Scalability Analysis — LTV Boost

## Current Build Status: BROKEN

Before addressing the full analysis, there are **active build errors** that must be fixed first. These came from both pre-existing issues and the recent lint-fix changes.

---

## PART 0 — CRITICAL BUILD ERRORS (Must Fix Immediately)

### 0.1 `fetch-store-metrics/index.ts` — Line 195
`thirtyDaysAgo()` returns `string`, but VTEX block calls `.toISOString()` on it.
**Fix:** Change `thirtyDaysAgo().toISOString().split("T")[0]` → `thirtyDaysAgo().split("T")[0]`

### 0.2 `ai-reply-suggest/index.ts` — Lines 150-153
`parsedReview` is `SafeParseReturnType` — accessing `.data` without narrowing.
**Fix:** Add `if (!parsedReview.success) return errorResponse(...)` guard before accessing `.data`.

### 0.3 `data-pipeline-cron/index.ts` — Lines 53, 57, 60, 64
Multiple implicit `any` types: `.map((o) => o.cliente_id)`, `c: any`, `o: any`.
**Fix:** Type `list` as `Array<Record<string, unknown>>`, cast `pmap` entries, type `custs` array.

### 0.4 `dispatch-newsletter/index.ts` — Lines 235-236, 435, 454, 457
`row.customer_id` typed as `unknown`; `SupabaseClient` type mismatch with helper functions.
**Fix:** Cast `row.customer_id as string`; change helper function signatures to accept `SupabaseClient<any, any, any>` or use `typeof sb`.

### 0.5 `enviar-pulse-semanal/index.ts` — Line 105
Same `SupabaseClient` type incompatibility.
**Fix:** Same approach as 0.4.

### 0.6 `normalize-webhook.test.ts` — Line 16
`Uint8Array` / `BufferSource` type mismatch in `crypto.subtle.sign`.
**Fix:** Cast with `new Uint8Array(body) as unknown as BufferSource` or use `ArrayBuffer`.

### 0.7 `dispatch-campaign/index.ts` — Line 26
`supabase: any` parameter.
**Fix:** Import and use `SupabaseClient` type or `ReturnType<typeof createClient>`.

---

## PART 1 — PER-PAGE ANALYSIS (Summary of Critical Issues)

### `/dashboard` (Dashboard Home) — 943 lines
| Area | Issue | Impact |
|------|-------|--------|
| Performance | `useDashboardHomeStats` fires 6+ parallel Supabase queries as fallback when RPC unavailable | High |
| Performance | Multiple `useMemo` chains (orchestrator, benchmark, churnRisk, moat, retention, propensity) computed every render cycle | Medium |
| Data | `fetchDashboardStatsLegacyData` line 168: `d: any` — lint violation still present | Medium |
| UX | No explicit empty state for new users without stores | Medium |

### `/dashboard/inbox` (Inbox) — 795 lines
| Area | Issue | Impact |
|------|-------|--------|
| Scalability | Realtime subscriptions per conversation + per store — at 100 tenants with 50 conversations each = 5,000+ channels | Critical |
| Performance | `useConversations` uses `useInfiniteQuery` but loads all pages into memory via `flatMap` | High |
| Resilience | Polling fallback (30s) is good, but no backoff on repeated failures | Medium |
| Security | `supabase.from("conversations").update({ unread_count: 0 })` bypasses any server-side validation | Low |

### `/dashboard/campanhas` (Campaigns) — 819 lines
| Area | Issue | Impact |
|------|-------|--------|
| Scalability | `fetchCampaignMetricsBundle` fallback fetches in chunks of 200, at 100 stores × 50 campaigns = massive query volume | High |
| UX | Campaign dispatch error messages not translated | Low |

### `/dashboard/contatos` (Contacts) — 378 lines
| Area | Issue | Impact |
|------|-------|--------|
| Performance | Cursor-based pagination is well-implemented | OK |
| Data | CSV export limited to page (50 rows) — documented as intentional | Low |

### `/dashboard/integracoes` (Integrations)
| Area | Issue | Impact |
|------|-------|--------|
| Functionality | `validate-integration` tests real API connectivity — good pattern | OK |
| Build | Recent lint fixes introduced the `CatalogItem`/`CatalogCategory` types | Fixed |

### Auth Flow (`ProtectedRoute`, `AuthContext`)
| Area | Issue | Impact |
|------|-------|--------|
| Resilience | Synthetic profile fallback with auto-retry is excellent | OK |
| Security | `catch (err: any)` in AuthContext line 79 — lint violation | Medium |
| Security | `is_password_rotation_due` RPC called on every protected route load — potential DB load | High |

---

## PART 2 — SCALABILITY ANALYSIS (100 E-Commerces)

### Capacity Estimation

```text
100 tenants × ~5 dashboard users each = 500 concurrent sessions
Each session: ~8 queries on dashboard load
Peak RPS: ~500 × 8 / 30s staleTime = ~133 RPS to Supabase
Realtime channels: ~500 (inbox) + ~500 (conversations) = ~1,000 channels
```

### Bottlenecks Identified

1. **Database: `get_dashboard_snapshot` RPC missing** — Every dashboard load falls back to 6+ individual queries. At 100 tenants this is ~800 queries per page load cycle.

2. **Database: No indexes documented** — Tables like `analytics_daily`, `campaigns`, `contacts`, `conversations` are queried with `.eq("store_id", ...)` but index existence is unverified.

3. **Realtime: Channel explosion** — Supabase Free/Pro has limits on concurrent realtime connections. 100 tenants with inbox open = 200+ persistent WebSocket channels.

4. **Edge Functions: Cold starts** — Serverless functions cold-start on each invocation. `dispatch-campaign` and `dispatch-newsletter` are critical paths that suffer under burst load.

5. **External API rate limits** — Shopify (2 req/s per app), VTEX, Meta WhatsApp Cloud API all have rate limits that will hit at 100 tenants dispatching simultaneously.

6. **No queue system** — Campaign dispatch, newsletter dispatch, and automation triggers are all synchronous. At scale, these need a proper queue (pg_boss, or Supabase Queues).

### Failure Points

| Component | Breaks At | What Fails |
|-----------|-----------|------------|
| Supabase DB pool | ~200 concurrent queries | Connection timeouts, dashboard blank |
| Realtime | ~500 channels | New subscriptions rejected |
| Edge Functions | ~50 concurrent invocations | 503 errors on dispatch |
| WhatsApp API | Platform rate limits | Messages queued but never sent |
| Anthropic API | 25s timeout per call | AI features timeout |

---

## PART 3 — GLOBAL ANALYSIS

### Cross-Page Inconsistencies
1. Mixed Portuguese/English in code (variable names, error messages)
2. Some pages use `useStoreScopeOptional()`, others use `getCurrentUserAndStore()` — two competing patterns
3. `useDashboard.ts` at 1,621 lines is a god-module containing 15+ hooks

### Repeated Technical Problems
1. **`any` types** throughout edge functions (dispatch-campaign L26, data-pipeline-cron L57/64, AuthContext L79)
2. **Missing type narrowing** on Zod parse results (ai-reply-suggest)
3. **SupabaseClient generic mismatch** across multiple edge functions when passing client to helpers

### Architectural Flaws
1. No job queue — all async work is synchronous edge function calls
2. No connection pooling config — relies on Supabase defaults
3. `profiles.plan` as source of truth for billing — should be Stripe webhook
4. Multi-tenant RLS relies on ~20 helper functions (`auth_row_read_user_store`, etc.) — any bug = data leak across tenants

### Security Concerns
1. `dispatch-campaign` L26: `supabase: any` — bypasses type checking on DB operations
2. No request size limits on most edge functions beyond what Deno imposes
3. `ALLOWED_ORIGIN` defaults to `*` when not set — documented but risky

---

## PRODUCTION READINESS SCORE: 5.5 / 10 (Partially Ready)

**Strengths:**
- Well-structured RLS policies with helper functions
- ErrorBoundary at route level
- Synthetic profile fallback with auto-retry
- Beta scope flag for feature gating
- Distributed rate limiting via Postgres RPC
- Good pagination patterns (cursor-based contacts)

**Weaknesses:**
- Active build errors blocking deployment
- No job queue for async operations
- Dashboard fallback queries are N+1 heavy
- No database indexes verification
- God-module `useDashboard.ts` (1,621 lines)
- Multiple `any` types in critical edge functions

---

## ALL REQUIRED FIXES

### 🔥 Critical (Must Fix Before Launch) — 8 items

1. **Fix all build errors** (Part 0 above — 7 files with TS errors)
2. **Deploy `get_dashboard_snapshot` RPC** or optimize fallback to max 2-3 queries
3. **Add database indexes** on `store_id` for: `analytics_daily`, `campaigns`, `contacts`, `conversations`, `messages`, `customers_v3`, `abandoned_carts`, `prescriptions`, `opportunities`
4. **Fix `profiles.plan` as billing source of truth** — reconcile with Stripe on login
5. **Fix `any` type in `dispatch-campaign` L26** (`canDispatchCampaign` function parameter)
6. **Fix Zod parse narrowing in `ai-reply-suggest`** — crash on malformed review input
7. **Fix `data-pipeline-cron` implicit `any` types** — data integrity risk
8. **Set `ALLOWED_ORIGIN`** in production Supabase secrets

### ⚡ High Priority — 6 items

9. **Split `useDashboard.ts`** into per-feature hooks (campaigns, contacts, conversations, analytics)
10. **Add job queue for campaign/newsletter dispatch** — pg_boss or Supabase Queues
11. **Implement Supabase Realtime channel limits** — pool channels per tenant, max 2-3 per user session
12. **Add external API rate limit handling** — retry-after headers, exponential backoff for Shopify/VTEX/Meta
13. **Cache `is_password_rotation_due` result** beyond sessionStorage — reduce RPC calls per navigation
14. **Add `staleTime` to `StoreScopeProvider` store list query** — currently uses default (30s), should be 5+ minutes

### 🧪 Medium Priority — 5 items

15. **Add health check endpoint** — simple edge function that returns 200 + DB ping
16. **Add Sentry/error tracking integration** — `src/lib/sentry.ts` exists but unclear if wired
17. **Add request timeout to all edge functions** — prevent hanging on external APIs
18. **Standardize store scope pattern** — remove `getCurrentUserAndStore()` in favor of `useStoreScopeOptional()`
19. **Add integration tests for critical edge functions** — dispatch-campaign, dispatch-newsletter

### 🟢 Low Priority — 4 items

20. **Translate remaining English error messages** to Portuguese
21. **Add `aria-label` attributes** to icon-only buttons across dashboard
22. **Add loading skeleton to all dashboard pages** (some pages show blank during load)
23. **Document all RPC functions** with parameter types and return schemas

---

## FINAL VERDICT

| Question | Answer |
|----------|--------|
| Production-ready? | **Partial** — Build errors must be fixed first; core auth/RLS is solid |
| Can handle 100 simultaneous e-commerces? | **No** — Dashboard fallback queries, no job queue, realtime channel limits will break at ~30-50 tenants |
| Current estimated capacity | **20-30 active tenants** with acceptable performance |
| Main risks | DB pool exhaustion on dashboard load, campaign dispatch timeouts, realtime channel limits |
| Must fix before scaling | Build errors, DB indexes, dashboard RPC, job queue for dispatch |

