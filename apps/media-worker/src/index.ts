import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assembleProject,
  getPackageMeta,
  resolveMediaToolPaths,
  runCommand,
} from '@ai-shorts-factory/media-engine';
import { BUSINESS_DEFAULTS, PHASE } from '@ai-shorts-factory/shared-types';
import { MemoryJobQueue } from '@ai-shorts-factory/workflow-engine';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Media worker entrypoint (Phase 5).
 * Claims ASSEMBLE_PROJECT jobs when a shared queue is available.
 * Smoke mode synthesizes five clips and assembles a ≤59s vertical MP4 locally.
 */
async function main(): Promise<void> {
  const enabled = process.env.MEDIA_WORKER_ENABLED === 'true';
  const smoke = process.env.MEDIA_WORKER_SMOKE === 'true';
  const keepalive = process.env.MEDIA_WORKER_KEEPALIVE === 'true';
  const workerId = process.env.MEDIA_WORKER_ID ?? `media-worker:${process.pid}`;
  const paths = resolveMediaToolPaths(process.env);

  console.info(
    JSON.stringify({
      service: 'media-worker',
      phase: PHASE.current,
      enabled,
      smoke,
      keepalive,
      workerId,
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

  const queue = new MemoryJobQueue();
  let idlePasses = 0;
  const maxIdlePasses = keepalive ? Number.POSITIVE_INFINITY : smoke ? 0 : 3;

  while (idlePasses < maxIdlePasses) {
    const job = await queue.claim(workerId, 300);
    if (!job) {
      idlePasses += 1;
      if (keepalive) {
        await sleep(2000);
      }
      continue;
    }

    console.info(
      JSON.stringify({
        service: 'media-worker',
        message: 'Job claimed',
        jobId: job.id,
        jobType: job.jobType,
        note: 'Memory queue is process-local; web assemble uses an inline media tick.',
      }),
    );

    if (job.jobType !== 'ASSEMBLE_PROJECT') {
      await queue.fail(job.id, workerId, 'media-worker only handles ASSEMBLE_PROJECT');
      continue;
    }

    // Shared Postgres-backed assembly with app store arrives with durable queue wiring.
    await queue.fail(
      job.id,
      workerId,
      'ASSEMBLE_PROJECT requires shared project/storage adapters; use web assemble tick or MEDIA_WORKER_SMOKE for local proof.',
    );
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
