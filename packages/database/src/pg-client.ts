import {
  assertSupabaseConfig,
  isSupabaseDbUrlConfigured,
  readDatabaseEnv,
} from './config.js';

/**
 * Minimal query surface matching PostgresJobQueueClient.
 * Implemented with `pg` when SUPABASE_DB_URL is set.
 */
export type SqlQueryClient = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

type PgPoolLike = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: unknown[] }>;
  end: () => Promise<void>;
};

let sharedPool: PgPoolLike | null = null;
let sharedUrl: string | null = null;

async function loadPgPool(connectionString: string): Promise<PgPoolLike> {
  // Dynamic import keeps unit tests without SUPABASE_DB_URL from requiring a live driver load path.
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  return new Pool({
    connectionString,
    // Free Nano: keep pool tiny (see SUPABASE_FREE_TIER_LIMITATIONS.md).
    max: Number(process.env.SUPABASE_PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  }) as PgPoolLike;
}

/**
 * Returns a shared pooled SQL client for workers / queue adapters.
 * Throws a clear error when DATABASE URL is missing.
 */
export async function createSqlQueryClient(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SqlQueryClient> {
  const config = assertSupabaseConfig(env, {
    requireDbUrl: true,
    purpose: 'Postgres SQL client',
  });
  const url = config.supabaseDbUrl!;

  if (!sharedPool || sharedUrl !== url) {
    if (sharedPool) {
      await sharedPool.end().catch(() => undefined);
    }
    sharedPool = await loadPgPool(url);
    sharedUrl = url;
  }

  const pool = sharedPool;
  return {
    async query<T = unknown>(sql: string, params?: unknown[]) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async end() {
      // Shared pool: callers should prefer closeSharedSqlQueryClient().
      return;
    },
  };
}

export async function closeSharedSqlQueryClient(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end().catch(() => undefined);
    sharedPool = null;
    sharedUrl = null;
  }
}

export function canCreateSqlQueryClient(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSupabaseDbUrlConfigured(env);
}

export function getDatabaseUrlHint(env: NodeJS.ProcessEnv = process.env): string | null {
  const config = readDatabaseEnv(env);
  if (config.supabaseDbUrl) return null;
  return 'Set SUPABASE_DB_URL to the Supabase pooler or direct connection string (Settings → Database). Prefer the transaction pooler for serverless; session/direct for long-lived workers with SKIP LOCKED.';
}
