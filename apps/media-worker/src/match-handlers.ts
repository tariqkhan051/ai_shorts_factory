import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createAudioEventDetector,
  createTtsProvider,
  probeMedia,
  readMatchIngestContractFromEnv,
  renderFullMatch,
  renderMatchEdit,
  resolveMediaToolPaths,
  validateMatchIngestProbe,
  verifyMatchRenderOutput,
  type MatchEditCutSegment,
} from '@ai-shorts-factory/media-engine';
import { createObjectStorage } from '@ai-shorts-factory/storage';
import type { JobQueue, WorkflowJobRecord } from '@ai-shorts-factory/workflow-engine';

function workRoot(jobId: string, leaf: string): string {
  return join(
    process.env.ASF_MEDIA_WORKER_CACHE_DIR?.trim() || join(tmpdir(), 'asf-media-worker'),
    leaf,
    jobId,
  );
}

async function resolveSourcePath(payload: Record<string, unknown>): Promise<string> {
  const localPath = String(payload.localPath ?? payload.sourcePath ?? '').trim();
  if (localPath) return localPath;

  const storageKey = String(payload.storageKey ?? '').trim();
  if (!storageKey) {
    throw new Error('Job payload missing localPath/sourcePath/storageKey');
  }

  const storage = createObjectStorage(process.env);
  if (!storage.downloadToFile) {
    throw new Error(
      `Storage provider ${storage.name} cannot download objects to disk for worker processing`,
    );
  }
  const dest = join(
    process.env.ASF_MEDIA_WORKER_CACHE_DIR?.trim() || join(tmpdir(), 'asf-media-worker'),
    'sources',
    `${randomUUID()}-${storageKey.split('/').pop() || 'source.mp4'}`,
  );
  await storage.downloadToFile(storageKey, dest);
  return dest;
}

function parseSegments(payload: Record<string, unknown>): MatchEditCutSegment[] {
  if (!Array.isArray(payload.segments)) return [];
  return payload.segments.map((raw) => {
    const row = raw as Record<string, unknown>;
    const sourceStartSeconds = Number(
      row.sourceStartSeconds ?? row.startSeconds ?? row.start ?? 0,
    );
    const sourceEndSeconds = Number(row.sourceEndSeconds ?? row.endSeconds ?? row.end ?? 0);
    const speed = Number(row.speed ?? 1);
    return { sourceStartSeconds, sourceEndSeconds, speed: speed > 0 ? speed : 1 };
  });
}

async function ensureNotCancelled(queue: JobQueue, jobId: string): Promise<void> {
  const current = await queue.getById(jobId);
  if (!current || current.state === 'cancelled') {
    throw new Error('JOB_CANCELLED');
  }
}

async function uploadOutputIfRequested(
  payload: Record<string, unknown>,
  localOutputPath: string,
): Promise<string | null> {
  const outputKey = String(payload.outputStorageKey ?? '').trim();
  if (!outputKey) return null;
  const storage = createObjectStorage(process.env);
  const body = await readFile(localOutputPath);
  await storage.putObject({
    key: outputKey,
    body,
    contentType: 'video/mp4',
  });
  return outputKey;
}

/**
 * Match Studio job handlers for media-worker.
 * Never routes Match VODs through Flow shorts assembleProject.
 */
export async function handleMatchStudioJob(
  queue: JobQueue,
  job: WorkflowJobRecord,
  workerId: string,
): Promise<void> {
  await ensureNotCancelled(queue, job.id);

  if (job.jobType === 'MATCH_INGEST_PROBE') {
    const localPath = String(job.payload.localPath ?? '').trim();
    const storageKey = String(job.payload.storageKey ?? '').trim();
    if (!localPath && !storageKey) {
      await queue.complete(job.id, workerId);
      return;
    }
    const sourcePath = await resolveSourcePath(job.payload);
    await ensureNotCancelled(queue, job.id);
    const paths = resolveMediaToolPaths(process.env);
    const probe = await probeMedia(paths, sourcePath);
    const validated = validateMatchIngestProbe(probe, readMatchIngestContractFromEnv());
    if (!validated.ok) {
      await queue.fail(
        job.id,
        workerId,
        validated.violations.map((v) => v.message).join('; '),
      );
      return;
    }
    await queue.complete(job.id, workerId);
    return;
  }

  if (job.jobType === 'MATCH_ANALYZE_AUDIO') {
    const sourcePath = await resolveSourcePath(job.payload);
    await ensureNotCancelled(queue, job.id);
    const dir = workRoot(job.id, 'audio');
    await mkdir(dir, { recursive: true });
    const detector = createAudioEventDetector(process.env);
    const hits = await detector.detect({
      audioOrVideoPath: sourcePath,
      workDir: dir,
      serverEnvironment:
        job.payload.serverEnvironment === 'advance' ? 'advance' : 'original',
    });
    await writeFile(join(dir, 'audio-hits.json'), JSON.stringify({ hits, detector: detector.name }));
    await queue.complete(job.id, workerId);
    return;
  }

  if (job.jobType === 'MATCH_SYNTHESIZE_VOICE') {
    await ensureNotCancelled(queue, job.id);
    const provider = createTtsProvider(process.env);
    if (provider.status !== 'ready') {
      await queue.fail(job.id, workerId, `TTS unavailable (${provider.status}): ${provider.name}`);
      return;
    }
    const text = String(job.payload.text ?? '').trim();
    if (!text) {
      await queue.fail(job.id, workerId, 'TTS payload missing text');
      return;
    }
    const dir = workRoot(job.id, 'tts');
    await mkdir(dir, { recursive: true });
    const result = await provider.synthesize({
      text,
      outputPath: join(dir, 'narration.wav'),
      voiceId: String(job.payload.voiceId ?? 'mock'),
    });
    await writeFile(join(dir, 'tts-meta.json'), JSON.stringify({ provider: provider.name, result }));
    await queue.complete(job.id, workerId);
    return;
  }

  if (job.jobType === 'MATCH_RENDER_FULL' || job.jobType === 'MATCH_RENDER_SHORTS') {
    await ensureNotCancelled(queue, job.id);
    const sourcePath = await resolveSourcePath(job.payload);
    const segments = parseSegments(job.payload);
    if (segments.length === 0) {
      await queue.fail(job.id, workerId, `${job.jobType} requires payload.segments`);
      return;
    }

    const dir = workRoot(job.id, 'render');
    await mkdir(dir, { recursive: true });
    const outputPath = join(
      dir,
      job.jobType === 'MATCH_RENDER_SHORTS' ? 'shorts.mp4' : 'full.mp4',
    );

    await ensureNotCancelled(queue, job.id);

    if (job.jobType === 'MATCH_RENDER_FULL') {
      const rendered = await renderFullMatch({
        sourcePath,
        workDir: join(dir, 'work'),
        outputPath,
        segments,
        narrationPath: job.payload.narrationPath
          ? String(job.payload.narrationPath)
          : undefined,
        maxSeconds: Number(job.payload.maxSeconds ?? 3600),
      });
      await ensureNotCancelled(queue, job.id);
      const verification = await verifyMatchRenderOutput({
        outputPath: rendered.outputPath,
        minDurationSeconds: 0.1,
      });
      if (!verification.ok) {
        await queue.fail(
          job.id,
          workerId,
          `Full-match render verification failed: ${verification.errors.join('; ')}`,
        );
        return;
      }
      await ensureNotCancelled(queue, job.id);
      const uploadedKey = await uploadOutputIfRequested(job.payload, rendered.outputPath);
      await writeFile(
        join(dir, 'render-result.json'),
        JSON.stringify({
          outputPath: rendered.outputPath,
          durationSeconds: rendered.durationSeconds,
          outputStorageKey: uploadedKey,
          verification,
        }),
      );
      await queue.complete(job.id, workerId);
      return;
    }

    const shorts = await renderMatchEdit({
      sourceVideoPath: sourcePath,
      workDir: join(dir, 'work'),
      outputPath,
      segments,
      profile: 'short',
      maxSeconds: Number(job.payload.maxSeconds ?? 59),
    });
    const shortsVerify = await verifyMatchRenderOutput({
      outputPath: shorts.outputPath,
      minDurationSeconds: 0.1,
    });
    if (!shortsVerify.ok) {
      await queue.fail(
        job.id,
        workerId,
        `Shorts render verification failed: ${shortsVerify.errors.join('; ')}`,
      );
      return;
    }
    await ensureNotCancelled(queue, job.id);
    await uploadOutputIfRequested(job.payload, shorts.outputPath);
    await queue.complete(job.id, workerId);
    return;
  }

  if (job.jobType === 'MATCH_QUALITY_CHECK') {
    const outputPath = String(job.payload.outputPath ?? '').trim();
    if (!outputPath) {
      await queue.fail(job.id, workerId, 'MATCH_QUALITY_CHECK requires payload.outputPath');
      return;
    }
    const verification = await verifyMatchRenderOutput({
      outputPath,
      minDurationSeconds: Number(job.payload.minDurationSeconds ?? 0.1),
    });
    const qualityDir = workRoot(job.id, 'quality');
    await mkdir(qualityDir, { recursive: true });
    await writeFile(join(qualityDir, 'quality.json'), JSON.stringify(verification, null, 2));
    if (!verification.ok) {
      await queue.fail(job.id, workerId, verification.errors.join('; '));
      return;
    }
    await queue.complete(job.id, workerId);
    return;
  }

  if (
    job.jobType === 'MATCH_ANALYZE_ROSTER' ||
    job.jobType === 'MATCH_ANALYZE_TIMELINE' ||
    job.jobType === 'MATCH_CORRELATE_EVENTS' ||
    job.jobType === 'MATCH_GENERATE_COMMENTARY' ||
    job.jobType === 'MATCH_BUILD_EDL'
  ) {
    await queue.fail(
      job.id,
      workerId,
      `${job.jobType} analysis/EDL orchestration still uses Match Studio services/CLIs; media-worker handles probe/audio/tts/render/quality. Provide MATCH_RENDER_* or MATCH_INGEST_PROBE / MATCH_ANALYZE_AUDIO / MATCH_SYNTHESIZE_VOICE payloads for worker execution.`,
    );
    return;
  }

  if (job.jobType === 'ASSEMBLE_PROJECT') {
    await queue.fail(
      job.id,
      workerId,
      'ASSEMBLE_PROJECT remains on the Shorts Factory web tick path. Match Studio must not use Flow assemble for VODs.',
    );
    return;
  }

  await queue.fail(job.id, workerId, `Unsupported job type for media-worker: ${job.jobType}`);
}
