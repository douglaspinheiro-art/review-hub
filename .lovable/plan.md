

# Automating WhatsApp Connection for Stores — Embedded Signup in Onboarding

## Current State
- The **Embedded Signup** button ("Conectar com Facebook") already works on the `/dashboard/whatsapp` page
- The **Onboarding** flow (Step 2) still shows a QR code placeholder and says "configure later in Dashboard"
- New stores must navigate to the WhatsApp page after onboarding to connect — friction that hurts activation

## What Changes

### 1. Integrate Embedded Signup into Onboarding Step 2
Replace the QR code placeholder in `src/pages/Onboarding.tsx` (Step 2) with a "Conectar com Facebook" button that triggers the same `launchEmbeddedSignup()` flow. After a successful OAuth, the step shows a green checkmark with the connected phone number and auto-advances to Step 3.

### 2. Handle store_id timing
During onboarding, the store may have just been created. The component needs to fetch the user's store ID (from `stores` table) before launching the signup. If no store exists yet, show a message prompting the user to complete Step 1 first.

### 3. Success state in onboarding
After successful connection:
- Show connected phone number with green badge
- "Configurar depois" becomes "Continuar →" 
- Auto-advance to Step 3 after 2 seconds

### 4. Keep manual fallback
Add a small "Configurar manualmente depois" link below the button for users who prefer to set up later.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Onboarding.tsx` | Replace Step 2 QR placeholder with Embedded Signup button + success state |

No new edge functions, migrations, or secrets needed — everything reuses the existing `launchEmbeddedSignup` helper and `meta-wa-oauth` edge function.

## Technical Notes
- Import `launchEmbeddedSignup` from `@/lib/whatsapp/meta-embedded-signup`
- Read `VITE_META_APP_ID` from `import.meta.env`
- Query user's store from Supabase to get `store_id`
- On success, store connection status in local state to show the green confirmation

