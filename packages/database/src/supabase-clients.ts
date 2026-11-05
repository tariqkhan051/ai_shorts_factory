import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertSupabaseConfig,
  getSupabasePublicConfig,
  readDatabaseEnv,
  type DatabaseEnv,
} from './config.js';

export type CreateServiceSupabaseOptions = {
  env?: NodeJS.ProcessEnv;
  /** Override purpose string in assertion errors. */
  purpose?: string;
};

/**
 * Privileged Supabase client (service role). Bypasses RLS.
 * Use only in trusted server/worker code. Never import from Client Components.
 */
export function createServiceSupabaseClient(
  options: CreateServiceSupabaseOptions = {},
): SupabaseClient {
  const env = options.env ?? process.env;
  const config = assertSupabaseConfig(env, {
    requireServiceRole: true,
    purpose: options.purpose ?? 'Service-role Supabase client',
  });

  return createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Anon/public Supabase client without cookie binding.
 * Useful for workers that only need PostgREST with explicit filters,
 * or scripts. Prefer SSR cookie client in Next.js request paths.
 */
export function createAnonSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient | null {
  const publicConfig = getSupabasePublicConfig(env);
  if (!publicConfig) return null;
  return createClient(publicConfig.url, publicConfig.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function resolveDatabaseEnvForWorker(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseEnv {
  return readDatabaseEnv(env);
}
