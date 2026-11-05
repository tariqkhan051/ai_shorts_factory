import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryBrandRepository } from './memory-brand-repository.js';
import { MemoryProjectRepository } from './memory-project-repository.js';
import { MemoryProjectDnaRepository } from './memory-project-dna-repository.js';
import { MemoryVideoRepository } from './memory-video-repository.js';
import { MemoryGameKnowledgeRepository } from './memory-game-knowledge-repository.js';
import { createProjectWithPlatform } from './content-platform-service.js';
import { GameKnowledgeActivationError } from './game-knowledge-activation.js';

const userId = '11111111-1111-1111-1111-111111111111';

describe('game knowledge activation (Milestone 1)', () => {
  const brands = new MemoryBrandRepository();
  const projects = new MemoryProjectRepository();
  const dna = new MemoryProjectDnaRepository(projects);
  const videos = new MemoryVideoRepository(projects);
  const knowledge = new MemoryGameKnowledgeRepository(projects, videos);

  beforeEach(() => {
    brands.clear();
    projects.clear();
    dna.clear();
    videos.clear();
    knowledge.clear();
  });

  async function seedOriginalAndAdvance() {
    const profile = await knowledge.createProfile(userId, {
      slug: 'mlbb',
      name: 'Mobile Legends: Bang Bang',
      description: 'MOBA knowledge base',
      terminology: { lord: 'Lord', turtle: 'Turtle' },
      gameplay_rules: '5v5 MOBA',
    });
    await knowledge.upsertServerProfile(userId, profile.id, {
      environment: 'original',
      terminology: {},
      recognition_config: { hud_profile: 'original_v1' },
      notes: 'Live server',
    });
    await knowledge.upsertServerProfile(userId, profile.id, {
      environment: 'advance',
      terminology: {},
      recognition_config: { hud_profile: 'advance_v1' },
      notes: 'Experimental server',
    });

    const originalDraft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'original',
      patch_code: '1.9.42',
      title: 'Original Server 1.9.42',
      notes: 'Live balance',
    });
    const natalia = await knowledge.upsertHero(userId, originalDraft.id, {
      hero_key: 'natalia',
      name: 'Natalia',
      roles: ['assassin'],
      lanes: ['jungle'],
      description: 'Silent blade',
      damage_types: ['physical'],
      cc_types: [],
    });
    await knowledge.upsertAbility(userId, natalia.id, {
      ability_key: 'assassin_instinct',
      slot: 'passive',
      name: 'Assassin Instinct',
      description: 'Live passive',
      experimental: false,
    });
    const originalPublished = await knowledge.publishPatch(userId, originalDraft.id);

    const advanceDraft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'advance',
      patch_code: '1.9.42-exp',
      title: 'Advance experimental Natalia',
      notes: 'Experimental ability change',
    });
    const nataliaAdvance = await knowledge.upsertHero(userId, advanceDraft.id, {
      hero_key: 'natalia',
      name: 'Natalia',
      roles: ['assassin'],
      lanes: ['jungle'],
      description: 'Advance revamp draft',
    });
    await knowledge.upsertAbility(userId, nataliaAdvance.id, {
      ability_key: 'experimental_cloak',
      slot: 'ultimate',
      name: 'Experimental Cloak',
      description: 'Advance-only ultimate modification',
      experimental: true,
    });
    const advancePublished = await knowledge.publishPatch(userId, advanceDraft.id);

    return { profile, originalPublished, advancePublished };
  }

  it('rejects activating a draft patch on a project', async () => {
    const profile = await knowledge.createProfile(userId, {
      slug: 'mlbb',
      name: 'MLBB',
    });
    const draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'original',
      patch_code: 'draft-1',
      title: 'Draft',
    });
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Channel',
        category: 'gaming',
        input: {
          idea: 'Match highlights',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    await expect(
      knowledge.activateOnProject(userId, created.project.id, {
        game_profile_id: profile.id,
        server_environment: 'original',
        game_patch_id: draft.id,
      }),
    ).rejects.toMatchObject({ code: 'PATCH_NOT_PUBLISHED' } satisfies Partial<GameKnowledgeActivationError>);
  });

  it('rejects binding an Advance patch to an Original match', async () => {
    const { profile, advancePublished } = await seedOriginalAndAdvance();
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'Original matches',
        category: 'gaming',
        input: {
          idea: 'Ranked Original Server VOD',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );
    const video = created.video!;

    await expect(
      knowledge.bindOnVideo(userId, video.id, {
        server_environment: 'original',
        game_patch_id: advancePublished.id,
      }),
    ).rejects.toMatchObject({ code: 'ENVIRONMENT_MISMATCH' });

    await expect(
      knowledge.activateOnProject(userId, created.project.id, {
        game_profile_id: profile.id,
        server_environment: 'original',
        game_patch_id: advancePublished.id,
      }),
    ).rejects.toMatchObject({ code: 'ENVIRONMENT_MISMATCH' });
  });

  it('activates published Original patch and strips experimental abilities at resolve', async () => {
    const { profile, originalPublished } = await seedOriginalAndAdvance();
    const created = await createProjectWithPlatform(
      { brands, projects, dna, videos },
      userId,
      {
        name: 'MLBB Original',
        category: 'gaming',
        input: {
          idea: 'Lord steal highlight',
          existing_story: '',
          additional_instructions: '',
          character_reference_notes: '',
        },
      },
    );

    const binding = await knowledge.activateOnProject(userId, created.project.id, {
      game_profile_id: profile.id,
      server_environment: 'original',
      game_patch_id: originalPublished.id,
    });
    expect(binding.server_environment).toBe('original');

    const project = await projects.getById(userId, created.project.id);
    expect(project?.active_game_patch_id).toBe(originalPublished.id);
    expect(project?.game_server_environment).toBe('original');

    await knowledge.bindOnVideo(userId, created.video!.id, {
      server_environment: 'original',
      game_patch_id: originalPublished.id,
    });
    const video = await videos.getById(userId, created.video!.id);
    expect(video?.game_patch_id).toBe(originalPublished.id);

    const resolved = await knowledge.resolveActivatedKnowledge(userId, {
      server_environment: 'original',
      game_patch_id: originalPublished.id,
    });
    expect(resolved.patch.status).toBe('published');
    expect(resolved.heroes[0]?.abilities.every((a) => !a.experimental)).toBe(true);
  });

  it('keeps Advance experimental abilities only when Advance is activated', async () => {
    const { advancePublished } = await seedOriginalAndAdvance();
    const resolved = await knowledge.resolveActivatedKnowledge(userId, {
      server_environment: 'advance',
      game_patch_id: advancePublished.id,
    });
    expect(resolved.heroes[0]?.abilities.some((a) => a.experimental)).toBe(true);
  });

  it('makes published patch hero/ability content immutable', async () => {
    const { originalPublished } = await seedOriginalAndAdvance();
    const heroes = await knowledge.listHeroes(userId, originalPublished.id);
    const hero = heroes[0]!;

    await expect(
      knowledge.upsertHero(userId, originalPublished.id, {
        hero_key: 'natalia',
        name: 'Natalia Revamp',
      }),
    ).rejects.toMatchObject({ code: 'PATCH_IMMUTABLE' });

    await expect(
      knowledge.updateHero(userId, hero.id, { name: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'PATCH_IMMUTABLE' });

    await expect(
      knowledge.upsertAbility(userId, hero.id, {
        ability_key: 'new_skill',
        slot: 'skill1',
        name: 'Should fail',
      }),
    ).rejects.toMatchObject({ code: 'PATCH_IMMUTABLE' });
  });

  it('does not treat draft as active even if project fields are somehow set', async () => {
    const profile = await knowledge.createProfile(userId, { slug: 'mlbb', name: 'MLBB' });
    const draft = await knowledge.createPatch(userId, profile.id, {
      server_environment: 'original',
      patch_code: 'unpub',
      title: 'Unpublished',
    });

    await expect(
      knowledge.resolveActivatedKnowledge(userId, {
        server_environment: 'original',
        game_patch_id: draft.id,
      }),
    ).rejects.toMatchObject({ code: 'PATCH_NOT_PUBLISHED' });
  });
});
