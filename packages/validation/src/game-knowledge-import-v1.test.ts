import { describe, expect, it } from 'vitest';
import {
  GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION,
  parseGameKnowledgeImportPackage,
  safeParseGameKnowledgeImportPackage,
} from './game-knowledge-import-v1.js';

describe('game-knowledge-import-v1', () => {
  it('parses a minimal Original package', () => {
    const pkg = parseGameKnowledgeImportPackage({
      schema_version: GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION,
      game: { slug: 'mlbb', name: 'MLBB' },
      server_environment: 'original',
      patch: { patch_code: '1.0.0', title: 'Test' },
      heroes: [
        {
          hero_key: 'natalia',
          name: 'Natalia',
          abilities: [
            {
              ability_key: 'smoke_bomb',
              slot: 'skill1',
              name: 'Smoke Bomb',
              experimental: false,
            },
          ],
        },
      ],
    });
    expect(pkg.server_environment).toBe('original');
    expect(pkg.heroes[0]?.abilities[0]?.slot).toBe('skill1');
  });

  it('rejects experimental abilities on Original packages', () => {
    const result = safeParseGameKnowledgeImportPackage({
      schema_version: GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION,
      game: { slug: 'mlbb', name: 'MLBB' },
      server_environment: 'original',
      patch: { patch_code: '1.0.0', title: 'Bad' },
      heroes: [
        {
          hero_key: 'natalia',
          name: 'Natalia',
          abilities: [
            {
              ability_key: 'exp',
              slot: 'ultimate',
              name: 'Exp',
              experimental: true,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('allows experimental abilities on Advance packages', () => {
    const pkg = parseGameKnowledgeImportPackage({
      schema_version: GAME_KNOWLEDGE_IMPORT_SCHEMA_VERSION,
      game: { slug: 'mlbb', name: 'MLBB' },
      server_environment: 'advance',
      patch: { patch_code: '1.0.0-exp', title: 'Advance' },
      heroes: [
        {
          hero_key: 'natalia',
          name: 'Natalia',
          abilities: [
            {
              ability_key: 'experimental_cloak',
              slot: 'ultimate',
              name: 'Experimental Cloak',
              experimental: true,
            },
          ],
        },
      ],
    });
    expect(pkg.heroes[0]?.abilities[0]?.experimental).toBe(true);
  });
});
