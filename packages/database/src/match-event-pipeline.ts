import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { OcrProvider } from '@ai-shorts-factory/media-engine';
import {
  cropNormalizedRegion,
  sampleFramesAtTimestamps,
} from '@ai-shorts-factory/media-engine';
import {
  emptyEventDetectionConfig,
  type EventDetectionConfig,
  type MatchEventCandidate,
} from '@ai-shorts-factory/validation';
import { assertCanActivatePatch } from './game-knowledge-activation.js';
import type { GameKnowledgeRepository } from './game-knowledge-types.js';
import type { MatchAnalysisRepository } from './match-analysis-types.js';
import {
  buildEventWindows,
  dedupeEventSeeds,
  detectEventsFromOcrText,
  toMatchEventCandidate,
} from './match-event-detect.js';
import type {
  MatchTimelineRepository,
  MatchTimelineWithEvents,
} from './match-event-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function buildEventTimelineCacheKey(input: {
  contentChecksum: string;
  serverEnvironment: string;
  gamePatchId: string;
  detectionConfig: EventDetectionConfig;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        checksum: input.contentChecksum,
        env: input.serverEnvironment,
        patch: input.gamePatchId,
        config: input.detectionConfig,
        kind: 'event-timeline-v1',
      }),
    )
    .digest('hex');
}

export type AnalyzeMatchTimelineDeps = {
  knowledge: GameKnowledgeRepository;
  analysis: MatchAnalysisRepository;
  timelines: MatchTimelineRepository;
  ocr: OcrProvider;
  workDir: string;
};

function buildSampleTimestamps(
  config: EventDetectionConfig,
  durationSeconds: number | null,
): number[] {
  if (config.recognition.sample_timestamps_seconds.length > 0) {
    return config.recognition.sample_timestamps_seconds.slice(0, config.max_frames);
  }
  const duration = Math.max(config.sample_interval_seconds, durationSeconds ?? config.max_frames * config.sample_interval_seconds);
  const timestamps: number[] = [];
  for (
    let t = 0;
    t <= duration && timestamps.length < config.max_frames;
    t += config.sample_interval_seconds
  ) {
    timestamps.push(Number(t.toFixed(3)));
  }
  if (timestamps.length === 0) timestamps.push(0);
  return timestamps;
}

/**
 * Detect kill/objective/turret/teamfight candidates from local kill-feed OCR,
 * attach pre/main/post windows, and persist a correctable timeline.
 */
export async function analyzeMatchEventTimeline(
  userId: string,
  matchSourceId: string,
  deps: AnalyzeMatchTimelineDeps,
  options?: { force?: boolean; detectionConfig?: Partial<EventDetectionConfig> },
): Promise<MatchTimelineWithEvents> {
  const source = await deps.analysis.getSource(userId, matchSourceId);
  if (!source) throw new Error('Match source not found');
  if (!source.local_path) throw new Error('Match source has no local_path');
  if (!source.game_patch_id) {
    throw new Error(
      'Match source has no game_patch_id. Bind a published patch before timeline analysis.',
    );
  }
  const gamePatchId = source.game_patch_id;

  const patch = await deps.knowledge.getPatch(userId, gamePatchId);
  if (!patch) throw new Error('Game patch not found');
  assertCanActivatePatch({
    requestedEnvironment: source.server_environment,
    gameProfileId: patch.game_profile_id,
    patch,
  });

  const detectionConfig = emptyEventDetectionConfig(options?.detectionConfig);
  const checksum = source.content_checksum_sha256 ?? 'unknown';
  const cacheKey = buildEventTimelineCacheKey({
    contentChecksum: checksum,
    serverEnvironment: source.server_environment,
    gamePatchId,
    detectionConfig,
  });

  if (!options?.force) {
    const cached = await deps.timelines.getTimelineByCacheKey(
      userId,
      matchSourceId,
      cacheKey,
    );
    if (cached) return cached;
  }

  const activated = await deps.knowledge.resolveActivatedKnowledge(userId, {
    server_environment: source.server_environment,
    game_patch_id: gamePatchId,
  });
  const catalog = activated.heroes.map((hero) => ({
    hero_key: hero.hero_key,
    name: hero.name,
  }));

  const jobId = randomUUID();
  const jobDir = join(deps.workDir, `timeline-${jobId}`);
  await mkdir(jobDir, { recursive: true });

  const timestamps = buildSampleTimestamps(detectionConfig, source.duration_seconds);
  const frames = await sampleFramesAtTimestamps({
    videoPath: source.local_path,
    outputDir: join(jobDir, 'frames'),
    timestampsSeconds: timestamps,
    maxFrames: detectionConfig.max_frames,
  });

  const seeds = [];
  for (const frame of frames) {
    for (const region of detectionConfig.recognition.regions) {
      const cropPath = join(
        jobDir,
        'crops',
        `${region.id}-frame-${String(frame.index).padStart(3, '0')}.png`,
      );
      await cropNormalizedRegion({
        imagePath: frame.path,
        outputPath: cropPath,
        box: region.box,
      });
      const ocr = await deps.ocr.readImage(cropPath);
      const evidence = {
        region_id: String(region.id),
        frame_timestamp_seconds: frame.timestampSeconds,
        ocr_text: ocr.text,
        ocr_confidence: ocr.confidence,
        ocr_provider: ocr.provider,
      };
      seeds.push(
        ...detectEventsFromOcrText({
          text: ocr.text,
          timestampSeconds: frame.timestampSeconds,
          evidence,
          catalog,
        }),
      );
    }
  }

  const deduped = dedupeEventSeeds(seeds);
  const events: MatchEventCandidate[] = deduped.map((seed) =>
    toMatchEventCandidate(
      seed,
      buildEventWindows({
        timestampSeconds: seed.timestamp_seconds,
        preSeconds: detectionConfig.pre_seconds,
        mainSeconds: detectionConfig.main_seconds,
        postSeconds: detectionConfig.post_seconds,
      }),
      randomUUID(),
    ),
  );

  const timeline: MatchTimelineWithEvents = {
    id: randomUUID(),
    user_id: userId,
    match_source_id: matchSourceId,
    status: 'proposed',
    detection_config: detectionConfig,
    cache_key: cacheKey,
    notes: '',
    created_at: nowIso(),
    updated_at: nowIso(),
    events,
    server_environment: source.server_environment,
    game_patch_id: gamePatchId,
  };

  return deps.timelines.saveTimeline(userId, timeline);
}
