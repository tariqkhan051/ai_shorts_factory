import { describe, expect, it } from 'vitest';
import { MATCH_COMMENTARY_SCHEMA_VERSION } from '@ai-shorts-factory/validation';
import { buildMatchCommentaryPolishPrompt } from './commentary-prompt.js';

describe('match commentary polish prompt', () => {
  it('requires evidence bindings to stay unchanged', () => {
    const prompt = buildMatchCommentaryPolishPrompt({
      schema_version: MATCH_COMMENTARY_SCHEMA_VERSION,
      match_source_id: '11111111-1111-1111-1111-111111111111',
      timeline_id: '22222222-2222-2222-2222-222222222222',
      server_environment: 'original',
      game_patch_id: '33333333-3333-3333-3333-333333333333',
      language: 'en',
      lines: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          event_id: '55555555-5555-5555-5555-555555555555',
          claim_type: 'kill',
          text: 'Natalia takes down Tigreal!',
          confirmed: true,
          timestamp_seconds: 12,
          hero_keys_mentioned: ['natalia', 'tigreal'],
          player_tags_mentioned: [],
          ability_keys_mentioned: [],
        },
      ],
      generated_at: '2026-11-05T12:00:00.000Z',
      notes: '',
    });

    expect(prompt).toContain('Do NOT invent player names');
    expect(prompt).toContain('experimental abilities');
    expect(prompt).toContain(MATCH_COMMENTARY_SCHEMA_VERSION);
    expect(prompt).toContain('44444444-4444-4444-4444-444444444444');
  });
});
