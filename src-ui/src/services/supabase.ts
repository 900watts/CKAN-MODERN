export { supabase } from '../utils/supabase';
export { supabase as default } from '../utils/supabase';

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;
  return !!url && !!key && key.length > 10;
}
