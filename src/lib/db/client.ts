import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  var __supabaseAdmin: SupabaseClient | undefined;
}

/**
 * Server-only Supabase client using the service role key (bypasses RLS).
 * Tables keep RLS enabled with no policies, so the anon key cannot read them.
 * Never import this from a client component.
 */
export function db(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('db() is server-only');
  if (globalThis.__supabaseAdmin) return globalThis.__supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  globalThis.__supabaseAdmin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return globalThis.__supabaseAdmin;
}
