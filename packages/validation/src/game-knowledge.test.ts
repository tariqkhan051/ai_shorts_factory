import { describe, expect, it } from 'vitest';
import {
  createGamePatchSchema,
  createGameProfileSchema,
  createHeroKnowledgeSchema,
  parseActivateProjectGameKnowledge,
  parseBindVideoGameKnowledge,
} from './game-knowledge.js';

describe('game knowledge validation', () => {
  it('accepts a valid MLBB profile and patch', () => {
    const profile = createGameProfileSchema.parse({
      slug: 'mlbb',
      name: 'Mobile Legends: Bang Bang',
    });
    expect(profile.slug).toBe('mlbb');

    const patch = createGamePatchSchema.parse({
      server_environment: 'original',
      patch_code: '1.9.42',
      title: 'Balance patch',
    });
    expect(patch.server_environment).toBe('original');
  });

  it('rejects invalid hero keys and requires environment on bind', () => {
    expect(() =>
      createHeroKnowledgeSchema.parse({
        hero_key: 'Natalia!',
        name: 'Natalia',
      }),
    ).toThrow();

    expect(() => parseBindVideoGameKnowledge({ game_patch_id: 'not-a-uuid' })).toThrow();

    const bind = parseBindVideoGameKnowledge({
      server_environment: 'advance',
      game_patch_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(bind.server_environment).toBe('advance');

    const activate = parseActivateProjectGameKnowledge({
      game_profile_id: '11111111-1111-1111-1111-111111111111',
      server_environment: 'original',
      game_patch_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(activate.server_environment).toBe('original');
  });
});
