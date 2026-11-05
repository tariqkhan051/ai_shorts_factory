import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach } from 'vitest';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { canTransitionMatchStudioStatus } from '@ai-shorts-factory/validation';
import { MemoryBrandRepository } from './memory-brand-repository.js';
import { MemoryProjectDnaRepository } from './memory-project-dna-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { MemoryMatchAnalysisRepository } from './memory-match-analysis-repository.js';
import { MemoryMatchStudioRepository } from './memory-match-studio-repository.js';
import {
  attachRecordingToMatchStudioRun,
  bindPatchToMatchStudioRun,
  createMatchStudioRun,
  transitionMatchStudioRun,
} from './match-studio-service.js';
import {
  importGameKnowledgeAsDraft,
  publishGameKnowledgeWithConfirmation,
} from './game-knowledge-import.js';

const USER = '11111111-1111-1111-1111-111111111111';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const originalSample = readFileSync(
  join(root, 'assets/game-knowledge/mlbb-original-1.9.42.sample.json'),
  'utf8',
);
const advanceSample = readFileSync(
  join(root, 'assets/game-knowledge/mlbb-advance-1.9.42-exp.sample.json'),
  'utf8',
);

describe('Match Studio lifecycle', () => {
  const projects = new MemoryProjectRepository();
  const brands = new MemoryBrandRepository();
  const dna = new MemoryProjectDnaRepository(projects);
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const studio = new MemoryMatchStudioRepository();
  const analysis = new MemoryMatchAnalysisRepository();

  beforeEach(() => {
    projects.clear();
    brands.clear();
    knowledge.clear();
    studio.clear();
    analysis.clear();
  });

  async function seedPublishedPatches() {
    const original = await importGameKnowledgeAsDraft(knowledge, USER, originalSample);
    expect(original.ok).toBe(true);
    if (!original.ok) throw new Error('import failed');
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      USER,
      original.result.draft_patch.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );
    const advance = await importGameKnowledgeAsDraft(knowledge, USER, advanceSample);
    expect(advance.ok).toBe(true);
    if (!advance.ok) throw new Error('advance import failed');
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      USER,
      advance.result.draft_patch.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );
    return {
      profileId: original.result.profile.id,
      originalPatchId: original.result.draft_patch.id,
      advancePatchId: advance.result.draft_patch.id,
    };
  }

  it('creates gaming project + awaiting_upload run with bound patch', async () => {
    const seeded = await seedPublishedPatches();
    const { run, projectId } = await createMatchStudioRun(
      { brands, projects, dna, videos, knowledge, studio },
      USER,
      {
        title: 'Ranked scrim',
        server_environment: 'original',
        game_profile_id: seeded.profileId,
        game_patch_id: seeded.originalPatchId,
        patch_unknown: false,
      },
    );

    expect(run.status).toBe('awaiting_upload');
    expect(run.patch_resolution).toBe('bound');
    expect(run.project_id).toBe(projectId);
    const project = await projects.getById(USER, projectId);
    expect(project?.category).toBe('gaming');
  });

  it('allows explicit unknown patch and blocks Advance bind on Original run', async () => {
    const seeded = await seedPublishedPatches();
    const { run } = await createMatchStudioRun(
      { brands, projects, dna, videos, knowledge, studio },
      USER,
      {
        title: 'Unknown patch VOD',
        server_environment: 'original',
        game_profile_id: seeded.profileId,
        patch_unknown: true,
      },
    );
    expect(run.patch_resolution).toBe('unknown');
    expect(run.game_patch_id).toBeNull();

    await expect(
      bindPatchToMatchStudioRun(
        { studio, knowledge, analysis },
        USER,
        run.id,
        seeded.advancePatchId,
      ),
    ).rejects.toThrow(/mix|ENVIRONMENT|Advance|Original|Cannot bind/i);
  });

  it('enforces status transitions and attaches recording', async () => {
    expect(canTransitionMatchStudioStatus('awaiting_upload', 'ingesting')).toBe(true);
    expect(canTransitionMatchStudioStatus('completed', 'analyzing')).toBe(false);

    const seeded = await seedPublishedPatches();
    const { run } = await createMatchStudioRun(
      { brands, projects, dna, videos, knowledge, studio },
      USER,
      {
        title: 'Attach test',
        server_environment: 'original',
        game_profile_id: seeded.profileId,
        game_patch_id: seeded.originalPatchId,
      },
    );

    const source = await analysis.createSource(USER, {
      title: 'vod',
      local_path: 'C:/tmp/match.mp4',
      server_environment: 'original',
      game_patch_id: seeded.originalPatchId,
    });

    const attached = await attachRecordingToMatchStudioRun(
      { studio, analysis },
      USER,
      run.id,
      source.id,
    );
    expect(attached.status).toBe('ingesting');
    expect(attached.match_source_id).toBe(source.id);
    const updatedSource = await analysis.getSource(USER, source.id);
    expect(updatedSource?.project_id).toBe(run.project_id);

    const ready = await transitionMatchStudioRun(studio, USER, run.id, 'ready_for_analysis');
    expect(ready.status).toBe('ready_for_analysis');
  });
});
