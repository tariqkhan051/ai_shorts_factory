import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import {
  importGameKnowledgeAsDraft,
  previewGameKnowledgeImport,
  publishGameKnowledgeWithConfirmation,
  PUBLISH_GAME_KNOWLEDGE_PHRASE,
} from './game-knowledge-import.js';

const userId = '11111111-1111-1111-1111-111111111111';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const originalSample = readFileSync(
  join(root, 'assets/game-knowledge/mlbb-original-1.9.42.sample.json'),
  'utf8',
);
const advanceSample = readFileSync(
  join(root, 'assets/game-knowledge/mlbb-advance-1.9.42-exp.sample.json'),
  'utf8',
);

describe('game knowledge import (Milestone 2)', () => {
  const projects = new MemoryProjectRepository();
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);

  beforeEach(() => {
    projects.clear();
    videos.clear();
    knowledge.clear();
  });

  it('previews Original import with hero additions and does not write', async () => {
    const preview = await previewGameKnowledgeImport(knowledge, userId, originalSample);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.package.server_environment).toBe('original');
    expect(preview.diff.added_hero_keys).toEqual(expect.arrayContaining(['natalia', 'tigreal']));
    expect(await knowledge.listProfiles(userId)).toHaveLength(0);
  });

  it('imports Original and Advance as separate drafts without publishing', async () => {
    const original = await importGameKnowledgeAsDraft(knowledge, userId, originalSample);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(original.result.draft_patch.status).toBe('draft');
    expect(original.result.draft_patch.server_environment).toBe('original');

    const advance = await importGameKnowledgeAsDraft(knowledge, userId, advanceSample);
    expect(advance.ok).toBe(true);
    if (!advance.ok) return;
    expect(advance.result.draft_patch.status).toBe('draft');
    expect(advance.result.draft_patch.server_environment).toBe('advance');

    const profiles = await knowledge.listProfiles(userId);
    expect(profiles).toHaveLength(1);

    const originalHeroes = await knowledge.listHeroes(
      userId,
      original.result.draft_patch.id,
    );
    const advanceHeroes = await knowledge.listHeroes(userId, advance.result.draft_patch.id);
    expect(originalHeroes.map((h) => h.hero_key).sort()).toEqual(['natalia', 'tigreal']);
    expect(advanceHeroes.map((h) => h.hero_key)).toEqual(['natalia']);

    const advanceNatalia = advanceHeroes[0]!;
    const advanceAbilities = await knowledge.listAbilities(userId, advanceNatalia.id);
    expect(advanceAbilities.some((a) => a.experimental)).toBe(true);
  });

  it('rejects experimental abilities inside an Original import package', async () => {
    const tainted = JSON.parse(originalSample) as Record<string, unknown>;
    const heroes = tainted.heroes as Array<Record<string, unknown>>;
    const natalia = heroes[0]!;
    const abilities = natalia.abilities as Array<Record<string, unknown>>;
    abilities.push({
      ability_key: 'should_not_pass',
      slot: 'ultimate',
      name: 'Leak',
      experimental: true,
    });
    const result = await importGameKnowledgeAsDraft(
      knowledge,
      userId,
      JSON.stringify(tainted),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/experimental/i);
  });

  it('requires human confirmation phrase to publish; wrong phrase fails', async () => {
    const imported = await importGameKnowledgeAsDraft(knowledge, userId, originalSample);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    await expect(
      publishGameKnowledgeWithConfirmation(
        knowledge,
        userId,
        imported.result.draft_patch.id,
        'yes',
      ),
    ).rejects.toThrow(/PUBLISH_GAME_KNOWLEDGE/);

    const published = await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      imported.result.draft_patch.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );
    expect(published.status).toBe('published');

    await expect(
      knowledge.activateOnProject(userId, 'missing', {
        game_profile_id: imported.result.profile.id,
        server_environment: 'original',
        game_patch_id: published.id,
      }),
    ).rejects.toThrow(/Project not found/);
  });

  it('diffs a second Original import against the published baseline', async () => {
    const first = await importGameKnowledgeAsDraft(knowledge, userId, originalSample);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await publishGameKnowledgeWithConfirmation(
      knowledge,
      userId,
      first.result.draft_patch.id,
      PUBLISH_GAME_KNOWLEDGE_PHRASE,
    );

    const next = JSON.parse(originalSample) as {
      patch: { patch_code: string; previous_patch_code: string | null; title: string };
      heroes: Array<{ hero_key: string; name: string }>;
    };
    next.patch.patch_code = '1.9.43';
    next.patch.previous_patch_code = '1.9.42';
    next.patch.title = 'Original Server 1.9.43';
    next.heroes = next.heroes.filter((h) => h.hero_key === 'natalia');
    next.heroes[0]!.name = 'Natalia (buffed)';

    const preview = await previewGameKnowledgeImport(
      knowledge,
      userId,
      JSON.stringify(next),
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.diff.baseline_patch_code).toBe('1.9.42');
    expect(preview.diff.removed_hero_keys).toContain('tigreal');
    expect(preview.diff.changed_hero_keys).toContain('natalia');
  });

  it('never auto-publishes on import', async () => {
    const imported = await importGameKnowledgeAsDraft(knowledge, userId, advanceSample);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const patch = await knowledge.getPatch(userId, imported.result.draft_patch.id);
    expect(patch?.status).toBe('draft');
  });
});
