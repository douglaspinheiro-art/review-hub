/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** When "true", hides/blocks channel-heavy dashboard pages; see CLAUDE.md */
  readonly VITE_BETA_LIMITED_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
