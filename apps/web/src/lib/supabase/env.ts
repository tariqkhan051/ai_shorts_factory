import {
  describeSupabaseReadiness,
  getSupabasePublicConfig,
} from '@ai-shorts-factory/database';

/**
 * Public Supabase URL + anon/publishable key for browser and SSR cookie clients.
 * Returns null when unset so local PROJECT_STORE=memory keeps working.
 */
export function getSupabasePublicEnv() {
  const config = getSupabasePublicConfig(process.env);
  if (!config) return null;
  return { url: config.url, anonKey: config.anonKey };
}

export function getSupabaseReadiness() {
  return describeSupabaseReadiness(process.env);
}
