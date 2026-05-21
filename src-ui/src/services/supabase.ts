/**
 * Supabase client configuration for CKAN Modern.
 *
 * To activate:
 * 1. Replace SUPABASE_ANON_KEY with your anon/public key from
 *    Supabase Dashboard > Settings > API > Project API keys
 * 2. Run the SQL in supabase-schema.sql in Supabase SQL Editor
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null!; // will be checked via isSupabaseConfigured() before use

export function isSupabaseConfigured(): boolean {
  return !!SUPABASE_URL && SUPABASE_ANON_KEY.length > 20;
}

export default supabase;
