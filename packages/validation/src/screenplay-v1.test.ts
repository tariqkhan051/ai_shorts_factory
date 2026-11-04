import { describe, expect, it } from 'vitest';
import {
  formatScreenplayErrors,
  safeParseScreenplayV1,
  SCREENPLAY_SCHEMA_VERSION,
} from './screenplay-v1.js';

function validScreenplay() {
  return {
    schema_version: SCREENPLAY_SCHEMA_VERSION,
    title: 'Echoes in Neon',
    category: 'cinematic' as const,
    visual_style: 'realistic_cinematic' as const,
    story_summary: 'A courier delivers a memory chip across a rainy city.',
    hook: 'Rain hits neon as a package starts whispering.',
    characters: [
      {
        name: 'Rina',
        description: 'Courier',
        visual_identity: 'Short black hair, amber jacket',
      },
    ],
    scenes: [1, 2, 3, 4, 5].map((n) => ({
      scene_number: n,
      title: `Scene ${n}`,
      duration_seconds: 6,
      visual_description: `Visual for scene ${n}`,
      flow_prompt: `Flow prompt for scene ${n}`,
      narration: '',
      dialogue: '',
      text_overlay: '',
      transition_out: 'cut',
    })),
    ending: 'She opens the chip and hears her own voice.',
    publishing_metadata: {
      title: 'Echoes in Neon',
      description: 'A short cinematic delivery run.',
      tags: ['cinematic', 'sci-fi'],
    },
  };
}

describe('screenplaySchemaV1', () => {
  it('accepts a valid five-scene screenplay', () => {
    const result = safeParseScreenplayV1(validScreenplay());
    expect(result.success).toBe(true);
  });

  it('rejects fewer than five scenes', () => {
    const payload = validScreenplay();
    payload.scenes = payload.scenes.slice(0, 4);
    const result = safeParseScreenplayV1(payload);
    expect(result.success).toBe(false);
    expect(formatScreenplayErrors(result).join(' ')).toMatch(/exactly|length|scenes/i);
  });

  it('rejects non-sequential scene numbers', () => {
    const payload = validScreenplay();
    payload.scenes[2] = { ...payload.scenes[2]!, scene_number: 9 };
    const result = safeParseScreenplayV1(payload);
    expect(result.success).toBe(false);
    expect(formatScreenplayErrors(result).some((m) => m.includes('numbered'))).toBe(true);
  });
});
