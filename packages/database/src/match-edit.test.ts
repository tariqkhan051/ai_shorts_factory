import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resolveMediaToolPaths,
  runCommand,
  synthesizeColorClip,
} from '@ai-shorts-factory/media-engine';
import { APPROVE_MATCH_DISTRIBUTION_PHRASE } from '@ai-shorts-factory/shared-types';
import { MATCH_COMMENTARY_SCHEMA_VERSION } from '@ai-shorts-factory/validation';
import { approveMatchEditForDistribution } from './match-edit-approve.js';
import { buildMatchEditPlan } from './match-edit-plan.js';
import { assembleMatchEditFromTimeline } from './match-edit-pipeline.js';
import { buildEventWindows } from './match-event-detect.js';
import type { MatchTimelineWithEvents } from './match-event-types.js';
import { MemoryMatchEditRepository } from './memory-match-edit-repository.js';
import { MemoryMatchTimelineRepository } from './memory-match-timeline-repository.js';

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

function seedTimeline(): MatchTimelineWithEvents {
  const killId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const lordId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    user_id: userId,
    match_source_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    status: 'corrected',
    detection_config: {
      pre_seconds: 3,
      main_seconds: 2,
      post_seconds: 3,
      sample_interval_seconds: 2,
      max_frames: 30,
      recognition: {
        hud_profile: 'original_kill_feed_v1',
        sample_timestamps_seconds: [],
        max_frames: 24,
        regions: [
          {
            id: 'kill_feed',
            label: 'Kill feed',
            box: { x: 0.62, y: 0.08, w: 0.35, h: 0.28 },
          },
        ],
      },
    },
    cache_key: 'test',
    notes: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    server_environment: 'original',
    game_patch_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    events: [
      {
        id: killId,
        event_type: 'kill',
        timestamp_seconds: 10,
        confidence: 0.92,
        participants: [
          { role: 'actor', hero_key: 'natalia', player_tag: null, hero_name_raw: 'Natalia' },
          { role: 'target', hero_key: 'tigreal', player_tag: null, hero_name_raw: 'Tigreal' },
        ],
        evidence: [],
        windows: buildEventWindows({
          timestampSeconds: 10,
          preSeconds: 3,
          mainSeconds: 2,
          postSeconds: 3,
        }),
        notes: '',
        rejected: false,
        source: 'detector',
      },
      {
        id: lordId,
        event_type: 'lord',
        timestamp_seconds: 40,
        confidence: 0.88,
        participants: [],
        evidence: [],
        windows: buildEventWindows({
          timestampSeconds: 40,
          preSeconds: 3,
          mainSeconds: 2,
          postSeconds: 3,
        }),
        notes: '',
        rejected: false,
        source: 'detector',
      },
    ],
  };
}

describe('match event edit (Milestone 6)', () => {
  const timelines = new MemoryMatchTimelineRepository();
  const edits = new MemoryMatchEditRepository();
  let workDir = '';

  beforeEach(() => {
    timelines.clear();
    edits.clear();
  });

  afterEach(async () => {
    if (!workDir) return;
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Windows may briefly lock FFmpeg outputs; temp cleanup is best-effort.
    }
    workDir = '';
  });

  it('plans pre/post pads, boring speed-up, and 1–2 Shorts synced to event windows', () => {
    const timeline = seedTimeline();
    const plan = buildMatchEditPlan({
      timeline,
      sourceDurationSeconds: 60,
      config: { min_gap_for_boring_seconds: 8, boring_speed: 4, max_shorts: 2 },
    });

    const killSeg = plan.condensed_segments.find(
      (s) => s.event_id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    expect(killSeg).toBeTruthy();
    expect(killSeg!.source_start_seconds).toBe(7);
    expect(killSeg!.source_end_seconds).toBe(15);
    expect(killSeg!.speed).toBe(1);

    const boring = plan.condensed_segments.find((s) => s.kind === 'boring');
    expect(boring).toBeTruthy();
    expect(boring!.speed).toBe(4);

    expect(plan.shorts.length).toBe(2);
    // Lord ranks above kill by priority list.
    expect(plan.shorts[0]?.event_type).toBe('lord');
    expect(plan.shorts[0]?.source_start_seconds).toBe(37);
    expect(plan.shorts[0]?.source_end_seconds).toBe(45);
    expect(plan.shorts.every((s) => s.duration_seconds <= 59)).toBe(true);
  });

  it(
    'renders condensed + Shorts and requires approval phrase before distribution',
    async () => {
      if (!(await ffmpegAvailable())) return;

      workDir = await mkdtemp(join(tmpdir(), 'asf-match-edit-db-'));
      const timeline = seedTimeline();
      await timelines.saveTimeline(userId, timeline);

      const paths = resolveMediaToolPaths();
      const source = join(workDir, 'source.mp4');
      await synthesizeColorClip(paths, {
        outputPath: source,
        durationSeconds: 48,
        width: 720,
        height: 1280,
        fps: 30,
        color: '0x2980b9',
        label: 'match-edit-db',
      });

      const commentary = {
        schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
        match_source_id: timeline.match_source_id,
        timeline_id: timeline.id,
        server_environment: 'original' as const,
        game_patch_id: timeline.game_patch_id,
        language: 'en',
        lines: [
          {
            id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            event_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            claim_type: 'kill' as const,
            text: 'Natalia picks off Tigreal',
            confirmed: true,
            timestamp_seconds: 10,
            hero_keys_mentioned: ['natalia', 'tigreal'],
            player_tags_mentioned: [],
            ability_keys_mentioned: [],
          },
        ],
        generated_at: new Date().toISOString(),
        notes: '',
      };

      const result = await assembleMatchEditFromTimeline({
        userId,
        timelineId: timeline.id,
        sourceVideoPath: source,
        workDir: join(workDir, 'work'),
        outputDir: join(workDir, 'out'),
        timelines,
        edits,
        commentary,
        burnCaptions: false,
      });

      expect(result.edit.status).toBe('rendered');
      expect(result.artifacts.some((a) => a.kind === 'condensed')).toBe(true);
      expect(result.artifacts.filter((a) => a.kind === 'short').length).toBe(2);
      expect(result.artifacts.every((a) => a.width === 1080 && a.height === 1920)).toBe(true);
      expect(result.artifacts.every((a) => a.quality_ok)).toBe(true);
      const shortArtifacts = result.artifacts.filter((a) => a.kind === 'short');
      expect(shortArtifacts.every((a) => a.duration_seconds <= 59.05)).toBe(true);

      const rejected = await approveMatchEditForDistribution({
        userId,
        editId: result.edit.id,
        confirmationPhrase: 'WRONG',
        edits,
      });
      expect(rejected.ok).toBe(false);

      const approved = await approveMatchEditForDistribution({
        userId,
        editId: result.edit.id,
        confirmationPhrase: APPROVE_MATCH_DISTRIBUTION_PHRASE,
        edits,
      });
      expect(approved.ok).toBe(true);
      if (!approved.ok) return;
      expect(approved.edit.status).toBe('approved');
      expect(approved.edit.approved_at).toBeTruthy();
    },
    120_000,
  );
});
