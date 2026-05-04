/**
 * Supabase client configuration for CKAN Modern.
 *
 * To activate:
 * 1. Replace SUPABASE_ANON_KEY with your anon/public key from
 *    Supabase Dashboard > Settings > API > Project API keys
 * 2. Run the SQL in supabase-schema.sql in Supabase SQL Editor
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vfvelaaskkhhoeudcopr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdmVsYWFza2toaG9ldWRjb3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDgwMzEsImV4cCI6MjA5MDMyNDAzMX0.XCpbbKzOOg8vtrkhs8RTpQ-G-R4psaAFQ9PCum9IhpY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function isSupabaseConfigured(): boolean {
  return SUPABASE_ANON_KEY.length > 20;
}

export default supabase;
