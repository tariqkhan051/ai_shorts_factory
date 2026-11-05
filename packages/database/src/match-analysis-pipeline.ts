import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { OcrProvider } from '@ai-shorts-factory/media-engine';
import {
  cropNormalizedRegion,
  sampleFramesAtTimestamps,
} from '@ai-shorts-factory/media-engine';
import {
  DEFAULT_ORIGINAL_LOADING_HUD_CONFIG,
  emptyHudRecognitionConfig,
  type HudRecognitionConfig,
} from '@ai-shorts-factory/validation';
import { assertCanActivatePatch } from './game-knowledge-activation.js';
import type { GameKnowledgeRepository } from './game-knowledge-types.js';
import {
  matchHeroFromCatalog,
  parseRosterLines,
} from './match-analysis-hero-match.js';
import type {
  CreateMatchSourceInput,
  MatchAnalysisJobRecord,
  MatchAnalysisRepository,
  MatchOcrRegionEvidence,
  MatchRosterAnalysisResult,
  MatchRosterEntry,
  MatchSourceRecord,
} from './match-analysis-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildMatchAnalysisCacheKey(input: {
  contentChecksum: string;
  serverEnvironment: string;
  gamePatchId: string;
  recognitionConfig: HudRecognitionConfig;
}): string {
  const payload = JSON.stringify({
    checksum: input.contentChecksum,
    env: input.serverEnvironment,
    patch: input.gamePatchId,
    config: input.recognitionConfig,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export type AnalyzeMatchRosterDeps = {
  knowledge: GameKnowledgeRepository;
  analysis: MatchAnalysisRepository;
  ocr: OcrProvider;
  workDir: string;
};

/**
 * Ingest a local match video path and bind it to a published patch/environment.
 */
export async function ingestMatchVideo(
  analysis: MatchAnalysisRepository,
  knowledge: GameKnowledgeRepository,
  userId: string,
  input: CreateMatchSourceInput,
): Promise<MatchSourceRecord> {
  const patch = await knowledge.getPatch(userId, input.game_patch_id);
  if (!patch) throw new Error('Game patch not found');
  assertCanActivatePatch({
    requestedEnvironment: input.server_environment,
    gameProfileId: patch.game_profile_id,
    patch,
  });

  const fileStat = await stat(input.local_path);
  const checksum = input.content_checksum_sha256 ?? (await sha256File(input.local_path));
  return analysis.createSource(userId, {
    ...input,
    content_checksum_sha256: checksum,
    byte_size: input.byte_size ?? fileStat.size,
  });
}

/**
 * Sample frames → crop HUD regions → local OCR → map heroes via activated patch KB.
 * Caches completed results by content checksum + patch + recognition config.
 * Never calls paid cloud vision APIs.
 */
export async function analyzeMatchRoster(
  userId: string,
  matchSourceId: string,
  deps: AnalyzeMatchRosterDeps,
  options?: { force?: boolean; recognitionConfig?: HudRecognitionConfig },
): Promise<MatchAnalysisJobRecord> {
  const source = await deps.analysis.getSource(userId, matchSourceId);
  if (!source) throw new Error('Match source not found');
  if (!source.local_path) throw new Error('Match source has no local_path for analysis');

  const patch = await deps.knowledge.getPatch(userId, source.game_patch_id);
  if (!patch) throw new Error('Game patch not found');
  assertCanActivatePatch({
    requestedEnvironment: source.server_environment,
    gameProfileId: patch.game_profile_id,
    patch,
  });

  const serverProfile = await deps.knowledge.getServerProfile(
    userId,
    patch.game_profile_id,
    source.server_environment,
  );
  const recognitionConfig = emptyHudRecognitionConfig({
    ...DEFAULT_ORIGINAL_LOADING_HUD_CONFIG,
    ...(serverProfile?.recognition_config as Partial<HudRecognitionConfig> | undefined),
    ...options?.recognitionConfig,
  });

  const checksum = source.content_checksum_sha256 ?? (await sha256File(source.local_path));
  const cacheKey = buildMatchAnalysisCacheKey({
    contentChecksum: checksum,
    serverEnvironment: source.server_environment,
    gamePatchId: source.game_patch_id,
    recognitionConfig,
  });

  if (!options?.force) {
    const cached = await deps.analysis.getJobByCacheKey(userId, matchSourceId, cacheKey);
    if (cached && (cached.status === 'completed' || cached.status === 'cached') && cached.result) {
      return deps.analysis.saveJob(userId, {
        ...cached,
        status: 'cached',
        updated_at: nowIso(),
      });
    }
  }

  const jobId = randomUUID();
  let job: MatchAnalysisJobRecord = {
    id: jobId,
    user_id: userId,
    match_source_id: matchSourceId,
    status: 'sampling',
    cache_key: cacheKey,
    recognition_config: recognitionConfig,
    result: {},
    error_message: null,
    started_at: nowIso(),
    completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  job = await deps.analysis.saveJob(userId, job);

  try {
    const jobDir = join(deps.workDir, jobId);
    await mkdir(jobDir, { recursive: true });

    const frames = await sampleFramesAtTimestamps({
      videoPath: source.local_path,
      outputDir: join(jobDir, 'frames'),
      timestampsSeconds: recognitionConfig.sample_timestamps_seconds,
      maxFrames: recognitionConfig.max_frames,
    });

    job = await deps.analysis.saveJob(userId, { ...job, status: 'ocr' });

    const ocrRegions: MatchOcrRegionEvidence[] = [];
    for (const frame of frames) {
      for (const region of recognitionConfig.regions) {
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
        ocrRegions.push({
          region_id: String(region.id),
          frame_timestamp_seconds: frame.timestampSeconds,
          crop_path: cropPath,
          text: ocr.text,
          confidence: ocr.confidence,
          provider: ocr.provider,
        });
      }
    }

    job = await deps.analysis.saveJob(userId, { ...job, status: 'mapping' });

    const activated = await deps.knowledge.resolveActivatedKnowledge(userId, {
      server_environment: source.server_environment,
      game_patch_id: source.game_patch_id,
    });
    const catalog = activated.heroes.map((h) => ({
      hero_key: h.hero_key,
      name: h.name,
    }));

    const roster: MatchRosterEntry[] = [];
    let linesParsed = 0;
    for (const region of ocrRegions) {
      const lines = parseRosterLines(region.text);
      linesParsed += lines.length;
      for (const line of lines) {
        const heroMatch = line.heroNameRaw
          ? matchHeroFromCatalog(line.heroNameRaw, catalog)
          : null;
        roster.push({
          slot: roster.length + 1,
          player_tag: line.playerTag,
          player_tag_confidence: line.playerTag ? region.confidence : null,
          hero_name_raw: line.heroNameRaw,
          hero_key: heroMatch?.hero_key ?? null,
          hero_name: heroMatch?.hero_name ?? null,
          hero_confidence: heroMatch?.confidence ?? null,
          evidence: {
            region_id: region.region_id,
            frame_timestamp_seconds: region.frame_timestamp_seconds,
            ocr_text: region.text,
            ocr_confidence: region.confidence,
            ocr_provider: region.provider,
          },
        });
      }
    }

    const mapped = roster.filter((r) => r.hero_key);
    const confidences = mapped
      .map((r) => r.hero_confidence)
      .filter((c): c is number => typeof c === 'number');
    const meanHeroConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : null;

    const result: MatchRosterAnalysisResult = {
      match_source_id: matchSourceId,
      server_environment: source.server_environment,
      game_patch_id: source.game_patch_id,
      cache_key: cacheKey,
      frames_sampled: frames.length,
      ocr_regions: ocrRegions,
      roster,
      metrics: {
        lines_parsed: linesParsed,
        heroes_mapped: mapped.length,
        heroes_unmapped: roster.length - mapped.length,
        mean_hero_confidence: meanHeroConfidence,
      },
    };

    return deps.analysis.saveJob(userId, {
      ...job,
      status: 'completed',
      result,
      error_message: null,
      completed_at: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Match analysis failed';
    return deps.analysis.saveJob(userId, {
      ...job,
      status: 'failed',
      error_message: message,
      completed_at: nowIso(),
    });
  }
}
