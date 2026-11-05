import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assembleProject,
  getPackageMeta,
  resolveMediaToolPaths,
  runCommand,
} from '@ai-shorts-factory/media-engine';
import { canCreateSqlQueryClient, createSqlQueryClient } from '@ai-shorts-factory/database';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import { createJobQueue, type JobQueue } from '@ai-shorts-factory/workflow-engine';
import { handleMatchStudioJob } from './match-handlers.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createQueue(): Promise<JobQueue> {
  const mode = process.env.MATCH_JOB_QUEUE?.trim().toLowerCase() ?? 'file';
  if (mode === 'postgres') {
    if (!canCreateSqlQueryClient(process.env)) {
      throw new Error('MATCH_JOB_QUEUE=postgres requires SUPABASE_DB_URL');
    }
    const sql = await createSqlQueryClient(process.env);
    return createJobQueue({ env: process.env, sqlClient: sql });
  }
  return createJobQueue({ env: process.env });
}

/**
 * Media worker entrypoint.
 * Claims Match Studio jobs from shared FileJobQueue / Memory / Postgres.
 */
async function main(): Promise<void> {
  const enabled = process.env.MEDIA_WORKER_ENABLED === 'true';
  const smoke = process.env.MEDIA_WORKER_SMOKE === 'true';
  const keepalive = process.env.MEDIA_WORKER_KEEPALIVE === 'true';
  const workerId = process.env.MEDIA_WORKER_ID ?? `media-worker:${process.pid}`;
  const paths = resolveMediaToolPaths(process.env);
  const queueMode = process.env.MATCH_JOB_QUEUE?.trim().toLowerCase() ?? 'file';

  console.info(
    JSON.stringify({
      service: 'media-worker',
      phase: PHASE.current,
      enabled,
      smoke,
      keepalive,
      workerId,
      queueMode,
      mediaEngine: getPackageMeta(),
      tools: paths,
      defaults: {
        maxSeconds: BUSINESS_DEFAULTS.finalVideoMaxSeconds,
        width: BUSINESS_DEFAULTS.finalVideoTargetWidth,
        height: BUSINESS_DEFAULTS.finalVideoTargetHeight,
        fps: BUSINESS_DEFAULTS.finalVideoFps,
      },
    }),
  );

  if (!enabled) {
    console.info(
      JSON.stringify({
        service: 'media-worker',
        message: 'MEDIA_WORKER_ENABLED is false. Exiting without claiming jobs.',
      }),
    );
    return;
  }

  const version = await runCommand(paths.ffmpeg, ['-version'], { timeoutMs: 15_000 });
  if (version.code !== 0) {
    console.error(
      JSON.stringify({
        service: 'media-worker',
        level: 'error',
        message: `ffmpeg not available at ${paths.ffmpeg}`,
        stderr: version.stderr,
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (smoke) {
    const root = await mkdtemp(join(tmpdir(), 'asf-media-smoke-'));
    try {
      const fake = join(root, 'placeholder.bin');
      await writeFile(fake, Buffer.from('smoke-placeholder'));
      const result = await assembleProject({
        workDir: join(root, 'work'),
        outputPath: join(root, 'final.mp4'),
        allowSyntheticPlaceholders: true,
        scenes: [1, 2, 3, 4, 5].map((sceneNumber) => ({
          sceneNumber,
          path: fake,
          durationSeconds: BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
        })),
      });
      console.info(
        JSON.stringify({
          service: 'media-worker',
          message: 'Smoke assembly succeeded',
          outputPath: result.outputPath,
          durationSeconds: result.probe.durationSeconds,
          width: result.probe.width,
          height: result.probe.height,
          usedSyntheticPlaceholders: result.usedSyntheticPlaceholders,
          qualityNotes: result.quality.ok ? result.quality.notes : [],
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const queue = await createQueue();
  let idlePasses = 0;
  const maxIdlePasses = keepalive ? Number.POSITIVE_INFINITY : smoke ? 0 : 3;

  while (idlePasses < maxIdlePasses) {
    const job = await queue.claim(workerId, Number(process.env.WORKER_LEASE_SECONDS ?? 300));
    if (!job) {
      idlePasses += 1;
      if (keepalive) {
        await sleep(Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000));
      }
      continue;
    }

    console.info(
      JSON.stringify({
        service: 'media-worker',
        message: 'Job claimed',
        jobId: job.id,
        jobType: job.jobType,
      }),
    );

    try {
      if (job.state === 'cancelled') {
        continue;
      }
      await handleMatchStudioJob(queue, job, workerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown media-worker error';
      if (message === 'JOB_CANCELLED') {
        console.info(
          JSON.stringify({
            service: 'media-worker',
            message: 'Job cancelled before output; skipping complete',
            jobId: job.id,
          }),
        );
        continue;
      }
      await queue.fail(job.id, workerId, message);
    }
  }

  console.info(
    JSON.stringify({
      service: 'media-worker',
      message: keepalive ? 'Keepalive loop ended' : 'Idle; exiting claim loop',
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      service: 'media-worker',
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
