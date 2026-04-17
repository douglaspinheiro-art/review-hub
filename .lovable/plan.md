

## Automate GA4 connection in Step 4 (Onboarding)

### Goal
Replace the manual "Property ID + Access Token" form with a one-click **"Connect with Google"** flow, using Google OAuth to fetch the access token automatically and list the user's GA4 properties for selection — no need for the user to know what a Property ID is or generate tokens manually.

### Current state
- Step 4 asks user to paste `ga4_property_id` (numeric) and `ga4_access_token` (ya29... bearer token).
- Both are obtained manually from Google Cloud Console — high friction, ~95% of users abandon here.
- Token expires in ~1h, so even when entered correctly it stops working soon after.

### Proposed flow

```text
[Step 4] → Click "Connect with Google" 
   ↓ Google OAuth popup (scope: analytics.readonly)
   ↓ Returns access_token + refresh_token
[Backend] Saves refresh_token (encrypted) in stores
   ↓ Calls Google Analytics Admin API → list account properties
[UI] Dropdown with property names ("Minha Loja - GA4")
   ↓ User picks one → property_id auto-filled
[Auto-test] Calls buscar-ga4 → shows "✓ X visitors found in last 30d"
[Save & Continue]
```

### Technical breakdown

**1. Google Cloud Console setup (user-facing instructions)**
- Create OAuth 2.0 Client ID (Web application).
- Authorized redirect URI: `https://<project>.supabase.co/functions/v1/google-oauth-callback`.
- Required scopes: `https://www.googleapis.com/auth/analytics.readonly`.
- Enable APIs: Google Analytics Data API + Google Analytics Admin API.
- Provide `GOOGLE_CLIENT_ID` (public, frontend) and `GOOGLE_CLIENT_SECRET` (Supabase secret).

**2. New Edge Functions**
- `google-oauth-callback` — receives OAuth code, exchanges for tokens, saves `ga4_refresh_token` (encrypted) + `ga4_access_token` + `ga4_token_expires_at` in `stores`.
- `list-ga4-properties` — uses access_token to call Admin API `GET /v1beta/accountSummaries`, returns list of properties for dropdown.
- `refresh-ga4-token` (helper used by `sync-funil-ga4` and `buscar-ga4`) — when access_token expired, uses refresh_token to get new one. **Critical** because tokens last only 1h.

**3. Database migration**
Add columns to `stores`:
- `ga4_refresh_token TEXT` (encrypted via existing pgcrypto trigger)
- `ga4_token_expires_at TIMESTAMPTZ`
- `ga4_account_email TEXT` (for UI display: "Connected as joao@loja.com")

**4. Frontend changes — `src/pages/Onboarding.tsx` (Step 4 only)**
- Replace 2 input fields with one button: **"Connect with Google"**.
- Open Google OAuth in popup (`window.open` → polled for closure or `postMessage`).
- After callback: call `list-ga4-properties` → show dropdown.
- On selection: call `buscar-ga4` to validate + show visitor count.
- Keep "Skip for now" option intact.
- Keep manual fallback hidden behind a tiny "Use Property ID and Token manually" link (advanced users).

**5. Update existing flows to handle token refresh**
- `buscar-ga4` and `sync-funil-ga4`: before calling GA4 API, check `ga4_token_expires_at`; if expired, call `refresh-ga4-token` first.

### Files affected
| File | Change |
|---|---|
| `supabase/functions/google-oauth-callback/index.ts` | **New** |
| `supabase/functions/list-ga4-properties/index.ts` | **New** |
| `supabase/functions/_shared/refresh-ga4-token.ts` | **New** (shared helper) |
| `supabase/functions/buscar-ga4/index.ts` | Use refresh helper |
| `supabase/functions/sync-funil-ga4/index.ts` | Use refresh helper |
| `supabase/migrations/<timestamp>_ga4_oauth.sql` | **New** — add 3 columns |
| `src/pages/Onboarding.tsx` | Replace Step 4 form with OAuth button + property selector |
| `.env.example` | Document `VITE_GOOGLE_CLIENT_ID` + Supabase secret `GOOGLE_CLIENT_SECRET` |

### Required from the user (after approval)
1. **Google Cloud Console** — create OAuth Client ID (I'll provide a step-by-step). The user will give me `GOOGLE_CLIENT_ID` (frontend) and `GOOGLE_CLIENT_SECRET` (saved as Supabase secret).
2. The same project must have **Analytics Data API** + **Analytics Admin API** enabled.

### Out of scope for this iteration
- Multi-property selection (user picks one per store; switching later goes via Configurações).
- Service account / domain-wide delegation (enterprise scenario).
- Granular per-view permissions (we use the user's own access).

