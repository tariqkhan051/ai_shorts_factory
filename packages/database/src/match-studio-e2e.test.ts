import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { MemoryBrandRepository } from './memory-brand-repository.js';
import { MemoryProjectDnaRepository } from './memory-project-dna-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { MemoryMatchAnalysisRepository } from './memory-match-analysis-repository.js';
import { MemoryMatchCommentaryRepository } from './memory-match-commentary-repository.js';
import { MemoryMatchStudioRepository } from './memory-match-studio-repository.js';
import { MemoryMatchTimelineRepository } from './memory-match-timeline-repository.js';
import {
  attachRecordingToMatchStudioRun,
  createMatchStudioRun,
  transitionMatchStudioRun,
} from './match-studio-service.js';
import {
  importGameKnowledgeAsDraft,
  publishGameKnowledgeWithConfirmation,
} from './game-knowledge-import.js';
import { assertRunOwnedByUser, assertStorageKeyBelongsToRun } from './match-studio-ownership.js';
import { buildEventWindows } from './match-event-detect.js';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const originalSample = readFileSync(
  join(root, 'assets/game-knowledge/mlbb-original-1.9.42.sample.json'),
  'utf8',
);

/**
 * Milestone 9.9 — local end-to-end Match Studio path (Memory + MemoryJobQueue).
 * Live Supabase persistence is covered separately when MATCH_STUDIO_SUPABASE_E2E=true.
 */
describe('Match Studio end-to-end (local memory path)', () => {
  const projects = new MemoryProjectRepository();
  const brands = new MemoryBrandRepository();
  const dna = new MemoryProjectDnaRepository(projects);
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const studio = new MemoryMatchStudioRepository();
  const analysis = new MemoryMatchAnalysisRepository();
  const timelines = new MemoryMatchTimelineRepository();
  const commentary = new MemoryMatchCommentaryRepository();
  const jobs: Array<{ jobType: string; idempotencyKey: string; userId: string }> = [];

  beforeEach(() => {
    jobs.length = 0;
    projects.clear();
    brands.clear();
    knowledge.clear();
    studio.clear();
    analysis.clear();
    timelines.clear();
    commentary.clear();
  });

  it('creates run → registers source → persists correction → enqueues render job', async () => {
    const draft = await importGameKnowledgeAsDraft(knowledge, USER_A, originalSample);
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error('import failed');
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      USER_A,
      draft.result.draft_patch.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    const { run } = await createMatchStudioRun(
      { brands, projects, dna, videos, knowledge, studio },
      USER_A,
      {
        title: 'E2E Match',
        server_environment: 'original',
        game_profile_id: draft.result.profile.id,
        game_patch_id: draft.result.draft_patch.id,
        patch_unknown: false,
      },
    );
    expect(run.status).toBe('awaiting_upload');

    const source = await analysis.createSource(USER_A, {
      title: run.title,
      local_path: join(root, 'assets/game-knowledge/mlbb-original-1.9.42.sample.json'),
      server_environment: 'original',
      game_patch_id: run.game_patch_id,
      project_id: run.project_id,
      storage_key: `users/${USER_A}/match-studio/${run.id}/source/e2e.mp4`,
      byte_size: 2048,
      ingest_status: 'registered',
    });
    assertStorageKeyBelongsToRun(source.storage_key!, USER_A, run.id);

    await attachRecordingToMatchStudioRun({ studio, analysis }, USER_A, run.id, source.id);
    await transitionMatchStudioRun(studio, USER_A, run.id, 'ready_for_analysis');

    const timeline = await timelines.saveTimeline(USER_A, {
      id: '33333333-3333-3333-3333-333333333333',
      user_id: USER_A,
      match_source_id: source.id,
      status: 'proposed',
      detection_config: {
        pre_seconds: 3,
        main_seconds: 2,
        post_seconds: 3,
        sample_interval_seconds: 2,
        max_frames: 10,
        recognition: {
          hud_profile: 'test',
          sample_timestamps_seconds: [],
          max_frames: 10,
          regions: [],
        },
      },
      cache_key: 'e2e',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      server_environment: 'original',
      game_patch_id: run.game_patch_id!,
      events: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          event_type: 'kill',
          timestamp_seconds: 12,
          confidence: 0.4,
          participants: [{ player_tag: 'A1', hero_key: 'layla', team: 'blue' }],
          evidence: [{ kind: 'ocr', ref: 'frame:12' }],
          windows: buildEventWindows({
            timestampSeconds: 12,
            preSeconds: 3,
            mainSeconds: 2,
            postSeconds: 3,
          }),
          notes: '',
          rejected: false,
          source: 'detector',
        },
      ],
    });

    const corrected = await timelines.correctEvent(USER_A, timeline.id, {
      event_id: timeline.events[0]!.id!,
      timestamp_seconds: 12.5,
      notes: 'human corrected',
    });
    expect(corrected.events[0]?.source).toBe('human');
    expect(corrected.events[0]?.timestamp_seconds).toBe(12.5);

    await commentary.saveScript(USER_A, {
      match_studio_run_id: run.id,
      timeline_id: timeline.id,
      match_source_id: source.id,
      server_environment: 'original',
      game_patch_id: run.game_patch_id,
      style: 'esports_caster',
      script: {
        schema_version: 1,
        timeline_id: timeline.id,
        match_source_id: source.id,
        server_environment: 'original',
        game_patch_id: run.game_patch_id,
        language: 'en',
        style: 'esports_caster',
        segments: [],
        generated_at: new Date().toISOString(),
        notes: 'mock',
        approval_status: 'draft',
      } as never,
      segments: [{ text: 'mock line', event_id: timeline.events[0]!.id }],
    });

    jobs.push({
      jobType: 'MATCH_RENDER_FULL',
      idempotencyKey: `e2e-render:${run.id}`,
      userId: USER_A,
    });
    expect(jobs).toHaveLength(1);

    const owned = await studio.getRun(USER_A, run.id);
    assertRunOwnedByUser(owned, USER_A);
    expect(await studio.getRun(USER_B, run.id)).toBeNull();

    const listedCommentary = await commentary.listForRun(USER_A, run.id);
    expect(listedCommentary).toHaveLength(1);
  });
});

describe('Match Studio Supabase e2e (optional)', () => {
  const live = process.env.MATCH_STUDIO_SUPABASE_E2E === 'true';
  it.skipIf(!live)('requires configured Free Supabase project', () => {
    expect(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL).toBeTruthy();
  });
});
