import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://fjxyinzwewwfhipigfja.supabase.co';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_-kB26ryDgvOHJIfG5Fshzw_deGQ0zpl';

export const supabase = createClient(supabaseUrl, supabaseKey);
