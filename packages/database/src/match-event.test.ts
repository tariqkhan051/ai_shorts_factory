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
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { publishGameKnowledgeWithConfirmation } from './game-knowledge-import.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { MemoryMatchAnalysisRepository } from './memory-match-analysis-repository.js';
import { MemoryMatchTimelineRepository } from './memory-match-timeline-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { ingestMatchVideo } from './match-analysis-pipeline.js';
import {
  buildEventWindows,
  dedupeEventSeeds,
  detectEventsFromOcrText,
} from './match-event-detect.js';
import { analyzeMatchEventTimeline } from './match-event-pipeline.js';

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

describe('match event timeline (Milestone 4)', () => {
  const projects = new MemoryProjectRepository();
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const analysis = new MemoryMatchAnalysisRepository();
  const timelines = new MemoryMatchTimelineRepository();
  let workDir = '';

  beforeEach(async () => {
    projects.clear();
    videos.clear();
    knowledge.clear();
    analysis.clear();
    timelines.clear();
    workDir = await mkdtemp(join(tmpdir(), 'asf-events-'));
  });

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('detects kill/turtle/lord lines and builds pre/main/post windows', () => {
    const catalog = [
      { hero_key: 'natalia', name: 'Natalia' },
      { hero_key: 'tigreal', name: 'Tigreal' },
    ];
    const seeds = detectEventsFromOcrText({
      text: ['Natalia killed Tigreal', 'Your team has slain the Turtle', 'Lord has been slain'].join(
        '\n',
      ),
      timestampSeconds: 42,
      evidence: {
        region_id: 'kill_feed',
        frame_timestamp_seconds: 42,
        ocr_text: '',
        ocr_confidence: 0.9,
        ocr_provider: 'scripted',
      },
      catalog,
    });
    expect(seeds.map((s) => s.event_type).sort()).toEqual(['kill', 'lord', 'turtle']);
    expect(seeds.find((s) => s.event_type === 'kill')?.participants[0]?.hero_key).toBe('natalia');

    const windows = buildEventWindows({
      timestampSeconds: 42,
      preSeconds: 3,
      mainSeconds: 2,
      postSeconds: 3,
    });
    expect(windows).toEqual([
      { phase: 'pre', start_seconds: 39, end_seconds: 42 },
      { phase: 'main', start_seconds: 42, end_seconds: 44 },
      { phase: 'post', start_seconds: 44, end_seconds: 47 },
    ]);

    const deduped = dedupeEventSeeds([
      ...seeds,
      {
        event_type: 'kill',
        timestamp_seconds: 42.4,
        confidence: 0.5,
        participants: [],
        evidence: [],
      },
    ]);
    expect(deduped.filter((s) => s.event_type === 'kill')).toHaveLength(1);
  });

  it('builds a correctable timeline from fixture OCR and exports JSON', async () => {
    if (!(await ffmpegAvailable())) return;

    const profile = await knowledge.createProfile(userId, { slug: 'mlbb', name: 'MLBB' });
    const draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'original',
      patch_code: '1.9.42',
      title: 'Original',
    });
    await knowledge.upsertHero(userId, draft.id, { hero_key: 'natalia', name: 'Natalia' });
    await knowledge.upsertHero(userId, draft.id, { hero_key: 'tigreal', name: 'Tigreal' });
    const published = await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      draft.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    const videoPath = join(workDir, 'events-fixture.mp4');
    await synthesizeColorClip(resolveMediaToolPaths(), {
      outputPath: videoPath,
      durationSeconds: 2,
      width: 720,
      height: 1280,
      fps: 30,
      color: '0x243b55',
      label: 'event-fixture',
    });

    const source = await ingestMatchVideo(analysis, knowledge, userId, {
      title: 'Event fixture',
      local_path: videoPath,
      server_environment: 'original',
      game_patch_id: published.id,
      duration_seconds: 2,
    });

    const ocr = new ScriptedOcrProvider({
      '*': {
        text: ['Natalia killed Tigreal', 'Your team has slain the Turtle'].join('\n'),
        confidence: 0.92,
      },
    });

    const timeline = await analyzeMatchEventTimeline(
      userId,
      source.id,
      { knowledge, analysis, timelines, ocr, workDir },
      {
        detectionConfig: {
          pre_seconds: 3,
          main_seconds: 2,
          post_seconds: 3,
          sample_interval_seconds: 1,
          max_frames: 2,
          recognition: {
            hud_profile: 'test',
            sample_timestamps_seconds: [0.2, 1.0],
            max_frames: 2,
            regions: [
              {
                id: 'kill_feed',
                label: 'Kill feed',
                box: { x: 0.6, y: 0.05, w: 0.35, h: 0.3 },
              },
            ],
          },
        },
      },
    );

    expect(timeline.status).toBe('proposed');
    expect(timeline.events.length).toBeGreaterThanOrEqual(2);
    for (const event of timeline.events) {
      expect(event.windows?.map((w) => w.phase)).toEqual(['pre', 'main', 'post']);
    }

    const kill = timeline.events.find((event) => event.event_type === 'kill');
    expect(kill?.id).toBeTruthy();
    const corrected = await timelines.correctEvent(userId, timeline.id, {
      event_id: kill!.id!,
      timestamp_seconds: 1.5,
      notes: 'Human adjusted kill timing',
    });
    expect(corrected.status).toBe('corrected');
    const updatedKill = corrected.events.find((event) => event.id === kill!.id);
    expect(updatedKill?.timestamp_seconds).toBe(1.5);
    expect(updatedKill?.windows?.[0]?.end_seconds).toBe(1.5);
    expect(updatedKill?.source).toBe('human');

    const withManual = await timelines.addManualEvent(userId, timeline.id, {
      event_type: 'turret',
      timestamp_seconds: 1.8,
      notes: 'Operator confirmed turret',
    });
    expect(withManual.events.some((event) => event.event_type === 'turret')).toBe(true);

    const rejected = await timelines.correctEvent(userId, timeline.id, {
      event_id: withManual.events.find((event) => event.event_type === 'turtle')!.id!,
      rejected: true,
    });
    const exported = await timelines.exportTimeline(userId, rejected.id);
    expect(exported.schema_version).toBe('match-timeline-export-v1');
    expect(exported.events.some((event) => event.event_type === 'turtle')).toBe(false);
    expect(exported.events.some((event) => event.event_type === 'kill')).toBe(true);
  });
});
