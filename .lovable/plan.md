
User wants: in step 2, when the store connects, immediately fetch metrics from the platform AND persist them. Then step 3 just reads what's already saved — no re-fetch from the edge.

Approach:
1. **Step 2 — after successful validation + integration upsert**: invoke `fetch-store-metrics` immediately and save the result to `funnel_metrics` (or a simpler place like `localStorage` + state). Best: persist to `funnel_metrics_v3` or update `stores` row with the fetched values, AND keep them in component state + localStorage draft.
2. **Step 3 — read-only**: skip the edge call entirely if metrics are already in state/draft. Show them directly. Only call `fetch-store-metrics` as a fallback if nothing is cached.

This solves the 404 race condition (step 3 no longer depends on a fresh edge call) and gives instant UX.

Plan:

### Changes to `src/pages/Onboarding.tsx`

1. **In `handleValidateIntegration` (step 2 success path)** — after `persistActiveIntegration(storeId)`:
   - Invoke `fetch-store-metrics` with retry (1 retry after 1.5s).
   - On success: populate `faturamento`, `ticketMedio`, `numClientes`, `taxaAbandono` state; mark `metricsFetched=true`.
   - Save these values to the existing `localStorage` draft (already auto-synced via the persistence useEffect).
   - Show toast "Loja conectada e dados carregados".
   - On failure: don't block — user proceeds, step 3 will retry.

2. **In step 3 render** — check if metrics are already loaded:
   - If `faturamento > 0` (or new flag `metricsFetched`): show the values immediately, no loading spinner, no edge call.
   - If empty: keep current behavior (call edge with retry as fallback).

3. **Add a `metricsFetched` boolean** to track whether step 2 already populated the data, so step 3 knows to skip.

### Files
- `src/pages/Onboarding.tsx` only.

### Backend
- No changes. `fetch-store-metrics` and `integrations` table are correct.

### UX
- Step 2 success message becomes: "✓ Loja conectada — dados sincronizados".
- Step 3 becomes instant when coming from step 2.
- If user reloads on step 3, localStorage still has the metrics → still instant.
