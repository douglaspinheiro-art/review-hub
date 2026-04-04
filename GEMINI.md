# GEMINI.md - LTV Boost Project Mandates

This file contains foundational mandates for Gemini CLI while working on the LTV Boost project. These instructions take precedence over general defaults.

## Project Identity & Language
- **Project Name:** LTV Boost (WhatsApp Marketing SaaS for Brazilian e-commerces).
- **Target Audience:** Brazilian e-commerce owners and marketing teams.
- **Language:** ALL user-facing text (landing page, dashboard, notifications) MUST be in **Brazilian Portuguese (pt-BR)**. Code, variables, and internal documentation should remain in **English**.

## Technical Stack
- **Frontend:** Vite + React 18 + TypeScript + React Router 6 + TanStack Query 5.
- **Styling:** Tailwind CSS + shadcn/ui.
- **Backend/Auth:** Supabase (PostgreSQL, Auth, Edge Functions).
- **WhatsApp Integration:** Evolution API.
- **Animations:** Framer Motion.

## Design & UI Conventions
- **Primary Color:** Emerald Green (#10B981).
- **Component Library:** Use `shadcn/ui` components exclusively. Do not modify files in `src/components/ui/` directly; use them as primitives.
- **Imports:** Always use the `@/` alias for paths under `src/`.
- **Class Names:** Use the `cn()` utility from `@/lib/utils` for merging Tailwind classes.
- **Icons:** Use `lucide-react`.

## Architectural Guidelines
- **Auth Flow:** Authenticated routes must be wrapped in `ProtectedRoute`. Unauthenticated users should be redirected to `/login`.
- **Data Fetching:** Use TanStack Query hooks (found in `src/hooks/useDashboard.ts`) for data synchronization.
- **Forms:** Use `react-hook-form` with `zod` for validation, following shadcn/ui form patterns.
- **Mobile First:** Ensure all UI changes are responsive and optimized for mobile devices.

## Database & Backend
- **Migrations:** Follow the order specified in `CLAUDE.md` when applying migrations.
- **Edge Functions:** Located in `supabase/functions/`. Use Deno runtime.

## Quality Standards
- **Testing:** Add Vitest tests for new logic in `src/test/`.
- **Types:** While `noImplicitAny` is loose in this project, strive for explicit typing in new code.
- **Consistency:** Align with the existing "LTV Boost" branding and tone—professional, efficient, and growth-oriented.
