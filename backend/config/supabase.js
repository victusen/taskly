import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SECRET_KEY) {
  console.error("[BOOT] Set SUPABASE_URL and SUPABASE_SECRET_KEY in the Render Environment tab.");
  process.exit(1);
}

export const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);