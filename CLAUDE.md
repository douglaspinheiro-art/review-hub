# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run preview      # Preview production build
```

## Architecture

**Stack**: Vite + React 18 + TypeScript + React Router 6 + TanStack Query 5 + Tailwind CSS + shadcn/ui + Supabase

LTV Boost is a WhatsApp marketing SaaS for Brazilian e-commerces. The app has two main surfaces:

1. **Marketing site** — public pages at `/`, `/sobre`, `/pricing`, etc.
2. **Dashboard** — protected SaaS app at `/dashboard/*`

### Key conventions

- Path alias `@/` maps to `src/` — use this for all imports
- `cn()` from `src/lib/utils.ts` merges Tailwind class names
- All shadcn/ui components are in `src/components/ui/` — do not modify them directly
- Colors are HSL CSS variables in `src/index.css`; dark mode supported via `next-themes`
- TypeScript is loose: `noImplicitAny` and `strictNullChecks` are disabled

### Auth flow

- `src/hooks/useAuth.ts` — Supabase Auth hook (user, session, profile, signIn, signUp, signOut, isTrialActive, isPaid)
- `src/components/ProtectedRoute.tsx` — redirects unauthenticated users to `/login`
- On signup → auto-redirect to `/onboarding` (3-step wizard)
- Dashboard routes all wrapped in `<ProtectedRoute>` via `DashboardRoute` in App.tsx

### Data layer

- `src/lib/supabase.ts` — typed Supabase client
- `src/lib/database.types.ts` — TypeScript types for all tables
- `src/hooks/useDashboard.ts` — TanStack Query hooks for dashboard data
- Supabase credentials in `.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

### Dashboard structure

- `src/components/dashboard/DashboardLayout.tsx` — sidebar nav + mobile hamburger
- `src/pages/dashboard/` — one file per section:
  - `Dashboard.tsx` — KPIs, charts, recent activity
  - `Inbox.tsx` — split-pane conversation view
  - `Campanhas.tsx` + `CampaignModal.tsx` — campaign list + 3-step creation modal
  - `Contatos.tsx` — contacts table with filters
  - `Automacoes.tsx` — automation templates (cart, win-back, birthday, post-purchase)
  - `CarrinhoAbandonado.tsx` — abandoned cart monitoring and recovery
  - `Reviews.tsx` — review aggregation + AI reply suggestions
  - `Analytics.tsx` — charts with period selector
  - `WhatsApp.tsx` — Evolution API instance management
  - `Configuracoes.tsx` — profile, Evolution API config, webhook URLs
  - `Billing.tsx` — plan comparison, usage meters, trial countdown

### External integrations

- `src/lib/evolution-api.ts` — Evolution API client (WhatsApp Business open-source wrapper)
- `supabase/functions/webhook-cart/index.ts` — Deno edge function, receives abandoned cart events from Shopify/Nuvemshop/Tray/VTEX/WooCommerce

### Database migrations (run in order in Supabase SQL Editor)

1. `supabase/schema.sql` — core tables (contacts, conversations, messages, campaigns, analytics_daily)
2. `supabase/phase1-migration.sql` — profiles, whatsapp_connections, campaign_segments, abandoned_carts, RLS policies
3. `supabase/phase2-migration.sql` — automations, reviews, review_requests

### Build

Bundle is split into manual chunks in `vite.config.ts`: vendor-react, vendor-query, vendor-supabase, vendor-charts, vendor-forms.
