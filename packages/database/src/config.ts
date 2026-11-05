export type DataStoreMode = 'memory' | 'supabase';

/**
 * Typed Supabase / data-store configuration.
 * Public keys may appear in the browser bundle; secret keys must stay server/worker-only.
 */
export type DatabaseEnv = {
  store: DataStoreMode;
  /** Project URL (public). */
  supabaseUrl: string | undefined;
  /** Publishable / anon key (public). */
  supabaseAnonKey: string | undefined;
  /** Service-role key — server/worker only. Never ship to the browser. */
  supabaseServiceRoleKey: string | undefined;
  /** Direct or pooler Postgres URL for migrations + PostgresJobQueue. */
  supabaseDbUrl: string | undefined;
};

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export type SupabaseServiceConfig = SupabasePublicConfig & {
  serviceRoleKey: string;
};

export type AssertSupabaseOptions = {
  /** Require service-role key (workers / privileged server paths). */
  requireServiceRole?: boolean;
  /** Require Postgres connection string (queue / migrations helpers). */
  requireDbUrl?: boolean;
  /** Context string included in error messages. */
  purpose?: string;
};

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function readDatabaseEnv(env: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  const explicit = env.PROJECT_STORE ?? env.DATA_STORE;
  const supabaseUrl = firstDefined(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_URL,
  );
  const supabaseAnonKey = firstDefined(
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const supabaseServiceRoleKey = firstDefined(
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.SUPABASE_SECRET_KEY,
  );
  const supabaseDbUrl = firstDefined(env.SUPABASE_DB_URL, env.DATABASE_URL);

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
    supabaseDbUrl,
  };
}

export function isSupabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readDatabaseEnv(env);
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

export function isSupabaseServiceConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = readDatabaseEnv(env);
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

export function isSupabaseDbUrlConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(readDatabaseEnv(env).supabaseDbUrl);
}

/**
 * Returns public URL+anon when both are set; otherwise null.
 * Safe for browser and optional local-dev without Supabase.
 */
export function getSupabasePublicConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabasePublicConfig | null {
  const config = readDatabaseEnv(env);
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  return { url: config.supabaseUrl, anonKey: config.supabaseAnonKey };
}

/**
 * Fail-closed validation for code paths that require Supabase.
 * Does not throw when PROJECT_STORE=memory unless require* options force secrets.
 */
export function assertSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: AssertSupabaseOptions = {},
): DatabaseEnv {
  const config = readDatabaseEnv(env);
  const purpose = options.purpose ?? 'Supabase';
  const missing: string[] = [];

  if (config.store === 'supabase' || options.requireServiceRole || options.requireDbUrl) {
    if (!config.supabaseUrl) {
      missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
    }
    if (!config.supabaseAnonKey && config.store === 'supabase') {
      missing.push(
        'NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY)',
      );
    }
  }

  if (options.requireServiceRole && !config.supabaseServiceRoleKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (options.requireDbUrl && !config.supabaseDbUrl) {
    missing.push('SUPABASE_DB_URL (or DATABASE_URL)');
  }

  if (missing.length > 0) {
    throw new Error(
      `${purpose} is not configured. Missing: ${missing.join(', ')}. ` +
        `For local development without Supabase set PROJECT_STORE=memory. ` +
        `See SUPABASE_SETUP_GUIDE.md.`,
    );
  }

  return config;
}

/**
 * When PROJECT_STORE=supabase, public URL+anon must exist.
 * Soft helper for app boot diagnostics (does not throw).
 */
export function describeSupabaseReadiness(env: NodeJS.ProcessEnv = process.env): {
  store: DataStoreMode;
  publicConfigured: boolean;
  serviceConfigured: boolean;
  dbUrlConfigured: boolean;
  actionableHint: string | null;
} {
  const config = readDatabaseEnv(env);
  const publicConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const serviceConfigured = Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
  const dbUrlConfigured = Boolean(config.supabaseDbUrl);

  let actionableHint: string | null = null;
  if (config.store === 'supabase' && !publicConfigured) {
    actionableHint =
      'PROJECT_STORE=supabase but URL/anon key are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or switch to PROJECT_STORE=memory.';
  } else if (config.store === 'supabase' && !serviceConfigured) {
    actionableHint =
      'Supabase public config OK; set SUPABASE_SERVICE_ROLE_KEY for workers and lease mutations.';
  } else if (config.store === 'supabase' && !dbUrlConfigured) {
    actionableHint =
      'Set SUPABASE_DB_URL (pooler or direct) to use PostgresJobQueue and apply migrations.';
  }

  return {
    store: config.store,
    publicConfigured,
    serviceConfigured,
    dbUrlConfigured,
    actionableHint,
  };
}
