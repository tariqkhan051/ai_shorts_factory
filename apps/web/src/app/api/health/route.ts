import { PHASE } from '@ai-shorts-factory/shared-types';
import { getAppEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Liveness probe — process is up. Does not check external dependencies. */
export async function GET() {
  const env = getAppEnv();
  return Response.json(
    {
      ok: true,
      service: 'web',
      phase: PHASE.current,
      phaseName: PHASE.name,
      store: env.database.store,
      storage: env.r2Configured ? 'r2' : 'memory',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
