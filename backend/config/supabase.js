import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SECRET_KEY) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SECRET_KEY is missing in environment variables.');
}

export const supabase = createClient(
  ENV.SUPABASE_URL || '',
  ENV.SUPABASE_SECRET_KEY || ''
);
