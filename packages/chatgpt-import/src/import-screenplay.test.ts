import { describe, expect, it } from 'vitest';
import { buildChatGptProductionPrompt } from './prompt.js';
import { importScreenplayFromText } from './import-screenplay.js';
import { createSampleScreenplay } from './sample-screenplay.js';

describe('buildChatGptProductionPrompt', () => {
  it('requests exactly five scenes and JSON-only output', () => {
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
    expect(prompt).toMatch(/A shy robot learns to paint/);
  });
});

describe('importScreenplayFromText', () => {
  it('imports a valid sample screenplay', () => {
    const result = importScreenplayFromText(JSON.stringify(createSampleScreenplay()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.screenplay.scenes).toHaveLength(5);
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
});
