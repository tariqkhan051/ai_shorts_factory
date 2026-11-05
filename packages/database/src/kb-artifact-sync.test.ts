import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { KB_ARTIFACT_SYNC_SCHEMA_VERSION } from '@ai-shorts-factory/validation';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import { pullKbArtifactsAsDrafts } from './kb-artifact-sync.js';
import { publishGameKnowledgeWithConfirmation } from './game-knowledge-import.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { MemoryKbSyncRepository } from './memory-kb-sync-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';

const userId = '11111111-1111-1111-1111-111111111111';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const originalSamplePath = join(
  root,
  'assets/game-knowledge/mlbb-original-1.9.42.sample.json',
);

describe('kb artifact sync (Milestone 7)', () => {
  const projects = new MemoryProjectRepository();
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);
  const sync = new MemoryKbSyncRepository();

  beforeEach(() => {
    projects.clear();
    videos.clear();
    knowledge.clear();
    sync.clear();
  });

  it('imports new artifacts as drafts only and never auto-publishes', async () => {
    const run = await pullKbArtifactsAsDrafts({
      userId,
      knowledge,
      sync,
      baseDir: root,
      manifest: {
        schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
        artifacts: [{ path: 'assets/game-knowledge/mlbb-original-1.9.42.sample.json' }],
      },
    });

    expect(run.auto_publish).toBe(false);
    expect(run.imported_draft_count).toBe(1);
    expect(run.results[0]?.status).toBe('imported_draft');
    const draftId = run.results[0]?.draft_patch_id;
    expect(draftId).toBeTruthy();
    const patch = await knowledge.getPatch(userId, draftId!);
    expect(patch?.status).toBe('draft');
  });

  it('skips unchanged KB on second pull (same artifact bytes)', async () => {
    await pullKbArtifactsAsDrafts({
      userId,
      knowledge,
      sync,
      baseDir: root,
      manifest: {
        schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
        artifacts: [{ path: 'assets/game-knowledge/mlbb-original-1.9.42.sample.json' }],
      },
    });

    const second = await pullKbArtifactsAsDrafts({
      userId,
      knowledge,
      sync,
      baseDir: root,
      manifest: {
        schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
        artifacts: [{ path: 'assets/game-knowledge/mlbb-original-1.9.42.sample.json' }],
      },
    });

    expect(second.imported_draft_count).toBe(0);
    expect(second.skipped_unchanged_count).toBe(1);
    expect(second.results[0]?.status).toBe('skipped_unchanged');
  });

  it('skips noop vs published baseline without creating another draft', async () => {
    const first = await pullKbArtifactsAsDrafts({
      userId,
      knowledge,
      sync,
      baseDir: root,
      manifest: {
        schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
        artifacts: [{ path: 'assets/game-knowledge/mlbb-original-1.9.42.sample.json' }],
      },
    });
    const draftId = first.results[0]!.draft_patch_id!;
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      draftId,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    // Clear checksum bookkeeping to simulate a fresh inbox drop of identical research.
    sync.clear();

    const raw = await readFile(originalSamplePath, 'utf8');
    void raw;
    const again = await pullKbArtifactsAsDrafts({
      userId,
      knowledge,
      sync,
      baseDir: root,
      manifest: {
        schema_version: KB_ARTIFACT_SYNC_SCHEMA_VERSION,
        artifacts: [{ path: 'assets/game-knowledge/mlbb-original-1.9.42.sample.json' }],
      },
    });

    expect(again.imported_draft_count).toBe(0);
    expect(again.skipped_unchanged_count).toBe(1);
    expect(again.results[0]?.is_noop).toBe(true);
    expect(again.auto_publish).toBe(false);
  });
});
