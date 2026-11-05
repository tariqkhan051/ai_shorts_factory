import { describe, expect, it } from 'vitest';
import { buildChatGptProductionPrompt } from './prompt.js';

describe('buildChatGptProductionPrompt', () => {
  it('injects project DNA, locked library character IDs, and proposal rules', () => {
    const prompt = buildChatGptProductionPrompt({
      project_id: 'project_mlbb_001',
      project_dna_version: 3,
      name: 'MLBB Cinematic Universe',
      category: 'gaming',
      visual_style: 'realistic_cinematic',
      language: 'en',
      target_audience: 'MOBA fans',
      content_niche: 'MLBB cinematic storytelling',
      universe_context: 'Land of Dawn',
      idea: 'A warrior discovers betrayal',
      captions_on_video: true,
      library_characters: [
        {
          character_id: 'char_001',
          name: 'Alucard',
          description: 'Blade wielder',
          visual_identity: 'silver hair; red cloak',
          continuity_rules: 'Keep cloak red',
        },
      ],
      library_environments: [
        {
          environment_id: 'env_001',
          name: 'Shadow Citadel',
          kind: 'building',
          description: 'Dark fortress',
        },
      ],
      permanent_project_instructions: 'Always epic and cinematic',
    });

    expect(prompt).toContain('project_mlbb_001');
    expect(prompt).toContain('Project DNA version: 3');
    expect(prompt).toContain('MLBB cinematic storytelling');
    expect(prompt).toContain('Land of Dawn');
    expect(prompt).toContain('character_id="char_001"');
    expect(prompt).toContain('LOCKED — do not rewrite');
    expect(prompt).toContain('environment_id="env_001"');
    expect(prompt).toContain('proposed_new_characters');
    expect(prompt).toContain('Always epic and cinematic');
    expect(prompt).toContain('Captions are REQUIRED');
  });

  it('remains usable with legacy character fields', () => {
    const prompt = buildChatGptProductionPrompt({
      name: 'Legacy',
      category: 'other',
      visual_style: 'automatic',
      language: 'en',
      target_audience: '',
      idea: 'Something happens',
      characters: [
        {
          character_id: 'hero',
          name: 'Hero',
          description: 'Brave',
          visual_identity: 'cape',
        },
      ],
    });
    expect(prompt).toContain('character_id="hero"');
    expect(prompt).toContain('Something happens');
  });
});
