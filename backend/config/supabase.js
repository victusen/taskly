import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SECRET_KEY) {
  console.error(
    "[BOOT] Missing SUPABASE_URL / SUPABASE_SECRET_KEY. " +
      "Create backend/.env (copy backend/.env.example) for local development, " +
      "or set them in the Render Environment tab. The server is exiting."
  );
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