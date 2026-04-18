import { createClient } from '@supabase/supabase-js';
import { supabasePublicUrl, supabasePublishableKey } from '@/lib/supabase-public-env';
import type { Database } from './types';

const url = supabasePublicUrl;
const anonKey = supabasePublishableKey;

if (!url || !anonKey) {
  throw new Error(
    '[Supabase] Defina VITE_SUPABASE_URL (ou VITE_SUPABASE_PROJECT_ID) e VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY).',
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});