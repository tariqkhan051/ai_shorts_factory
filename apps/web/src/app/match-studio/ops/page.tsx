import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getAppEnv } from '@/lib/env';
import { isR2Configured } from '@ai-shorts-factory/storage';
import {
  canCreateSqlQueryClient,
  describeSupabaseReadiness,
  readDatabaseEnv,
} from '@ai-shorts-factory/database';
import { getMatchJobQueue, getMatchStudioRepository } from '@/lib/match-studio/runtime';

export default async function MatchStudioOpsPage() {
  const user = await requireUser();
  const env = getAppEnv();
  const db = readDatabaseEnv(process.env);
  const readiness = describeSupabaseReadiness(process.env);
  const queueMode = process.env.MATCH_JOB_QUEUE?.trim().toLowerCase() ?? 'file';
  const audioDetector = process.env.MATCH_AUDIO_DETECTOR?.trim().toLowerCase() ?? 'stub';
  const workerEnabled = process.env.MEDIA_WORKER_ENABLED === 'true';

  const studio = await getMatchStudioRepository();
  // Ops uses the authenticated user scope only — never list other users' runs.
  let pending = 0;
  let failed = 0;
  let running = 0;
  let lastSuccess: string | null = null;
  try {
    const queue = await getMatchJobQueue();
    const runs = await studio.listRuns(user.id);
    for (const run of runs.slice(0, 20)) {
      const jobs = await queue.listByProject(run.project_id);
      for (const job of jobs) {
        if (job.state === 'queued') pending += 1;
        if (job.state === 'leased') running += 1;
        if (job.state === 'failed') failed += 1;
        if (job.state === 'completed') {
          if (!lastSuccess || job.updatedAt > lastSuccess) lastSuccess = job.updatedAt;
        }
      }
    }
  } catch {
    // Queue may be misconfigured; surface below.
  }

  return (
    <div className="space-y-6">
      <Link href="/match-studio" className="text-xs text-accent hover:underline">
        ← Match Studio
      </Link>
      <h1 className="text-xl font-semibold">Match Studio operations</h1>
      <p className="text-sm text-muted">
        Diagnostics without secrets. Worker online ≠ config flag alone — check recent claims below.
      </p>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <h2 className="font-medium">Infrastructure</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>store: {db.store}</li>
            <li>supabase public: {String(readiness.publicConfigured)}</li>
            <li>supabase service: {String(readiness.serviceConfigured)}</li>
            <li>supabase db url: {String(readiness.dbUrlConfigured)}</li>
            <li>sql client ready: {String(canCreateSqlQueryClient(process.env))}</li>
            <li>storage provider: {process.env.STORAGE_PROVIDER ?? 'local'}</li>
            <li>r2 configured: {String(isR2Configured(process.env))}</li>
            <li>job queue: {queueMode}</li>
            <li>audio detector: {audioDetector}</li>
            <li>MEDIA_WORKER_ENABLED: {String(workerEnabled)}</li>
            <li>app url: {env.appUrl}</li>
          </ul>
          {readiness.actionableHint ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {readiness.actionableHint}
            </p>
          ) : null}
          {!workerEnabled ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Worker config exists but MEDIA_WORKER_ENABLED is false — do not assume a worker is
              online.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              MEDIA_WORKER_ENABLED is true. Confirm process heartbeats/claims separately.
            </p>
          )}
        </div>

        <div className="rounded-md border border-border p-3">
          <h2 className="font-medium">Jobs (your recent runs)</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>pending/queued: {pending}</li>
            <li>running/leased: {running}</li>
            <li>failed: {failed}</li>
            <li>last completed: {lastSuccess ?? '—'}</li>
          </ul>
          <p className="mt-2 text-xs text-muted">
            Temp artifact cleanup: delete worker cache dirs only. Never auto-delete original
            recordings or approved outputs.
          </p>
        </div>
      </section>

      <section className="rounded-md border border-border p-3 text-sm">
        <h2 className="font-medium">Manual recovery</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Inspect failed job `last_error` / render-result.json in worker cache.</li>
          <li>Fix media availability (R2 key or local path) without deleting originals.</li>
          <li>Re-enqueue with a new idempotency key.</li>
          <li>If Free Supabase paused, restore the project from the Dashboard.</li>
        </ol>
      </section>
    </div>
  );
}
