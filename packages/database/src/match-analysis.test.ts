import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ScriptedOcrProvider,
  resolveMediaToolPaths,
  runCommand,
  synthesizeColorClip,
} from '@ai-shorts-factory/media-engine';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { MemoryMatchAnalysisRepository } from './memory-match-analysis-repository.js';
import {
  analyzeMatchRoster,
  ingestMatchVideo,
} from './match-analysis-pipeline.js';
import {
  matchHeroFromCatalog,
  measureRosterPrecision,
  parseRosterLines,
} from './match-analysis-hero-match.js';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { publishGameKnowledgeWithConfirmation } from './game-knowledge-import.js';

const userId = '11111111-1111-1111-1111-111111111111';

async function ffmpegAvailable(): Promise<boolean> {
  try {
    const paths = resolveMediaToolPaths();
    const result = await runCommand(paths.ffmpeg, ['-version'], { timeoutMs: 10_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

describe('match roster analysis (Milestone 3)', () => {
  const projects = new MemoryProjectRepository();
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const analysis = new MemoryMatchAnalysisRepository();
  let workDir = '';

  beforeEach(async () => {
    projects.clear();
    videos.clear();
    knowledge.clear();
    analysis.clear();
    workDir = await mkdtemp(join(tmpdir(), 'asf-match-'));
  });

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('parses roster lines and fuzzy-matches heroes from the patch catalog', () => {
    const lines = parseRosterLines('LOADING ROSTER\nShadowFox - Natalia\nIronWall - Tigreal');
    expect(lines).toHaveLength(2);
    const catalog = [
      { hero_key: 'natalia', name: 'Natalia' },
      { hero_key: 'tigreal', name: 'Tigreal' },
    ];
    expect(matchHeroFromCatalog('Natalia', catalog)?.hero_key).toBe('natalia');
    expect(matchHeroFromCatalog('tigreal', catalog)?.hero_key).toBe('tigreal');
    expect(matchHeroFromCatalog('Nata1ia', catalog)?.hero_key).toBe('natalia');
  });

  it('ingests a fixture clip, OCRs roster regions, maps heroes, and caches results', async () => {
    if (!(await ffmpegAvailable())) return;

    const profile = await knowledge.createProfile(userId, {
      slug: 'mlbb',
      name: 'MLBB',
    });
    await knowledge.upsertServerProfile(userId, profile.id, {
      environment: 'original',
      recognition_config: {
        hud_profile: 'original_v1',
        sample_timestamps_seconds: [0.2],
        max_frames: 1,
        regions: [
          {
            id: 'loading_roster',
            label: 'Roster',
            box: { x: 0.05, y: 0.15, w: 0.9, h: 0.7 },
          },
        ],
      },
      terminology: {},
      notes: '',
    });
    const draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'original',
      patch_code: '1.9.42',
      title: 'Original fixture patch',
    });
    await knowledge.upsertHero(userId, draft.id, {
      hero_key: 'natalia',
      name: 'Natalia',
      roles: ['assassin'],
    });
    await knowledge.upsertHero(userId, draft.id, {
      hero_key: 'tigreal',
      name: 'Tigreal',
      roles: ['tank'],
    });
    const published = await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      draft.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    const videoPath = join(workDir, 'fixture.mp4');
    await synthesizeColorClip(resolveMediaToolPaths(), {
      outputPath: videoPath,
      durationSeconds: 1,
      width: 720,
      height: 1280,
      fps: 30,
      color: '0x102a43',
      label: 'match-roster-fixture',
    });

    const source = await ingestMatchVideo(analysis, knowledge, userId, {
      title: 'Synthetic loading screen',
      local_path: videoPath,
      server_environment: 'original',
      game_patch_id: published.id,
    });

    const ocrText = [
      'LOADING ROSTER',
      'ShadowFox - Natalia',
      'IronWall - Tigreal',
      'PixelQueen - Natalia',
    ].join('\n');
    const ocr = new ScriptedOcrProvider({
      '*': { text: ocrText, confidence: 0.95 },
    });

    const job = await analyzeMatchRoster(userId, source.id, {
      knowledge,
      analysis,
      ocr,
      workDir,
    });
    expect(job.status).toBe('completed');
    const result = job.result as {
      roster: Array<{ player_tag: string | null; hero_key: string | null }>;
      metrics: { heroes_mapped: number };
      cache_key: string;
    };
    expect(result.metrics.heroes_mapped).toBe(3);
    const precision = measureRosterPrecision({
      expected: [
        { playerTag: 'ShadowFox', heroKey: 'natalia' },
        { playerTag: 'IronWall', heroKey: 'tigreal' },
        { playerTag: 'PixelQueen', heroKey: 'natalia' },
      ],
      actual: result.roster,
    });
    expect(precision.precision).toBeGreaterThanOrEqual(1);
    expect(precision.matched).toBe(3);

    const cached = await analyzeMatchRoster(userId, source.id, {
      knowledge,
      analysis,
      ocr,
      workDir,
    });
    expect(cached.status).toBe('cached');
    expect((cached.result as { cache_key: string }).cache_key).toBe(result.cache_key);
  });

  it('rejects ingest when Advance patch is bound to Original environment', async () => {
    const profile = await knowledge.createProfile(userId, { slug: 'mlbb', name: 'MLBB' });
    const draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'advance',
      patch_code: 'exp',
      title: 'Advance',
    });
    const published = await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      draft.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );
    await expect(
      ingestMatchVideo(analysis, knowledge, userId, {
        title: 'Bad bind',
        local_path: join(workDir, 'missing.mp4'),
        server_environment: 'original',
        game_patch_id: published.id,
      }),
    ).rejects.toMatchObject({ code: 'ENVIRONMENT_MISMATCH' });
  });
});
