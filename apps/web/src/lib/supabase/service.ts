import { createServiceSupabaseClient } from '@ai-shorts-factory/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only privileged client. Never import from Client Components or shared UI modules.
 * Bypasses RLS — callers must enforce ownership explicitly.
 */
export function createServiceClient(): SupabaseClient {
  return createServiceSupabaseClient({
    purpose: 'Web service-role Supabase client',
  });
}
