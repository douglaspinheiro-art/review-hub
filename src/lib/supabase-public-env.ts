const connectedProjectId = "ydkglitowqlpizpnnofy";
const connectedPublishableKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlka2dsaXRvd3FscGl6cG5ub2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTc2NjEsImV4cCI6MjA5MDYzMzY2MX0.kJTWWxWN8cP4r1AtmM2XraJtjPM_qy8sxE2gHU9f8QE";

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID?.trim() || connectedProjectId;

export const supabasePublicUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  (projectId ? `https://${projectId}.supabase.co` : "");

export const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  connectedPublishableKey
)?.trim() || "";