import { isSupabaseConfigured, readDatabaseEnv } from '@ai-shorts-factory/database';
import { isR2Configured } from '@ai-shorts-factory/storage';

export function getAppEnv() {
  const database = readDatabaseEnv(process.env);
  return {
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    database,
    supabaseConfigured: isSupabaseConfigured(process.env),
    r2Configured: isR2Configured(process.env),
  };
}
