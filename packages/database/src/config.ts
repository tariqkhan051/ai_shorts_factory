export type DataStoreMode = 'memory' | 'supabase';

export type DatabaseEnv = {
  store: DataStoreMode;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
};

export function readDatabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseEnv {
  const explicit = env.PROJECT_STORE ?? env.DATA_STORE;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);
  const store: DataStoreMode =
    explicit === 'supabase' || explicit === 'memory'
      ? explicit
      : hasSupabase
        ? 'supabase'
        : 'memory';

  return {
    store,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

export function isSupabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readDatabaseEnv(env);
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}
