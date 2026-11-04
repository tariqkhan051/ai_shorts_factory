import { describe, expect, it } from 'vitest';
import { buildChatGptProductionPrompt } from './prompt.js';
import { importScreenplayFromText } from './import-screenplay.js';
import { normalizeImportedScreenplay } from './normalize.js';
import { createSampleScreenplay } from './sample-screenplay.js';

describe('buildChatGptProductionPrompt', () => {
  it('requests exactly five scenes, character_ids, and JSON-only output', () => {
    const prompt = buildChatGptProductionPrompt({
      name: 'Demo',
      category: 'anime',
      visual_style: 'anime',
      language: 'en',
      target_audience: 'teens',
      idea: 'A shy robot learns to paint',
    });
    expect(prompt).toMatch(/Exactly 5 scenes/i);
    expect(prompt).toMatch(/Return ONLY valid JSON/i);
    expect(prompt).toMatch(/character_id/);
    expect(prompt).toMatch(/A shy robot learns to paint/);
  });
});

describe('importScreenplayFromText', () => {
  it('imports a valid sample screenplay with character extraction', () => {
    const result = importScreenplayFromText(JSON.stringify(createSampleScreenplay()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.screenplay.scenes).toHaveLength(5);
      expect(result.screenplay.characters[0]?.character_id).toBe('rina');
      expect(result.screenplay.scenes[0]?.character_ids).toContain('rina');
      expect(result.screenplay.scenes[1]?.character_ids).toEqual(['rina']);
    }
  });

  it('accepts fenced JSON and rejects malformed JSON without inventing content', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(createSampleScreenplay())}\n\`\`\``;
    expect(importScreenplayFromText(fenced).ok).toBe(true);

    const bad = importScreenplayFromText('{not-json');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors[0]).toMatch(/Invalid JSON/i);
    }
  });

  it('rejects fewer than five scenes with readable errors', () => {
    const sample = createSampleScreenplay();
    sample.scenes = sample.scenes.slice(0, 4);
    const result = importScreenplayFromText(JSON.stringify(sample));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/scenes/i);
    }
  });

  it('normalizes legacy JSON: slugifies character_id and infers scene character_ids', () => {
    const legacy = {
      schema_version: '1.0.0',
      title: 'Legacy',
      category: 'cinematic',
      visual_style: 'realistic_cinematic',
      story_summary: 'Old format',
      hook: 'Hook',
      characters: [
        {
          name: 'Ava',
          description: 'Lead',
          visual_identity: 'Red coat',
        },
        {
          name: 'Daniel',
          description: 'Friend',
          visual_identity: 'Blue scarf',
        },
      ],
      scenes: [1, 2, 3, 4, 5].map((n) => ({
        scene_number: n,
        title: `Scene ${n}`,
        duration_seconds: 6,
        visual_description:
          n === 1 ? 'Ava and Daniel meet' : n === 2 ? 'Ava alone' : `Scene ${n} with Ava`,
        flow_prompt: `Prompt ${n}`,
        narration: '',
        dialogue: n === 3 ? 'Daniel: Wait.' : '',
        text_overlay: '',
        transition_out: 'cut',
      })),
      ending: 'Done',
      publishing_metadata: { title: 'Legacy', description: 'Old', tags: [] },
    };

    const normalized = normalizeImportedScreenplay(legacy) as {
      characters: Array<{ character_id: string; name: string }>;
      scenes: Array<{ character_ids: string[] }>;
    };
    expect(normalized.characters[0]?.character_id).toBe('ava');
    expect(normalized.characters[1]?.character_id).toBe('daniel');
    expect(normalized.scenes[0]?.character_ids).toEqual(expect.arrayContaining(['ava', 'daniel']));
    expect(normalized.scenes[1]?.character_ids).toEqual(['ava']);

    const imported = importScreenplayFromText(JSON.stringify(legacy));
    expect(imported.ok).toBe(true);
  });

  it('rejects invalid character_ids in scenes after normalize', () => {
    const sample = createSampleScreenplay();
    sample.scenes[0]!.character_ids = ['not-a-real-id'];
    const result = importScreenplayFromText(JSON.stringify(sample));
    expect(result.ok).toBe(false);
  });
});
