import { isSupabaseConfigured } from '@ai-shorts-factory/database';
import { isR2Configured } from '@ai-shorts-factory/storage';
import { getAppEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Readiness probe — fails closed when production mode lacks required backends.
 * Memory store is allowed only outside NODE_ENV=production.
 */
export async function GET() {
  const env = getAppEnv();
  const production = process.env.NODE_ENV === 'production';
  const issues: string[] = [];

  if (production && env.database.store === 'memory') {
    issues.push('PROJECT_STORE=memory is not allowed in production');
  }
  if (production && !isSupabaseConfigured(process.env)) {
    issues.push('Supabase is not configured');
  }
  if (production && process.env.STORAGE_PROVIDER === 'r2' && !isR2Configured(process.env)) {
    issues.push('STORAGE_PROVIDER=r2 but R2 credentials are incomplete');
  }
  if (process.env.FLOW_PROVIDER && process.env.FLOW_PROVIDER !== 'mock') {
    if (process.env.FLOW_LIVE_ENABLED !== 'true' || process.env.FLOW_UI_VERIFIED !== 'true') {
      issues.push('Live Flow provider selected without FLOW_LIVE_ENABLED and FLOW_UI_VERIFIED');
    }
  }

  const ok = issues.length === 0;
  return Response.json(
    {
      ok,
      ready: ok,
      issues,
      store: env.database.store,
      storage: env.r2Configured ? 'r2' : 'memory',
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
