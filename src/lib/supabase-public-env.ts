const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID?.trim();

export const supabasePublicUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  (projectId ? `https://${projectId}.supabase.co` : "");

export const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim() || "";