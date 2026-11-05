import {
  describeSupabaseReadiness,
  isSupabaseConfigured,
  isSupabaseDbUrlConfigured,
  isSupabaseServiceConfigured,
  readDatabaseEnv,
} from '@ai-shorts-factory/database';
import { isR2Configured } from '@ai-shorts-factory/storage';

export function getAppEnv() {
  const database = readDatabaseEnv(process.env);
  const supabase = describeSupabaseReadiness(process.env);
  return {
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    database,
    supabaseConfigured: isSupabaseConfigured(process.env),
    supabaseServiceConfigured: isSupabaseServiceConfigured(process.env),
    supabaseDbUrlConfigured: isSupabaseDbUrlConfigured(process.env),
    supabaseReadiness: supabase,
    r2Configured: isR2Configured(process.env),
  };
}
