import { describe, expect, it } from 'vitest';
import { buildFlowGenerationPackage } from '@ai-shorts-factory/flow-adapter';
import { createSampleScreenplay } from '@ai-shorts-factory/chatgpt-import';
import type { CharacterRecord } from '@ai-shorts-factory/database';
import { EMPTY_VISUAL_IDENTITY } from '@ai-shorts-factory/database';
import {
  buildProjectFlowGenerationPackage,
  charactersMissingReferences,
} from './flow-package.js';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

function character(partial: Partial<CharacterRecord> & Pick<CharacterRecord, 'id' | 'name'>): CharacterRecord {
  return {
    user_id: 'u1',
    description: '',
    visual_identity: '',
    visual_identity_structured: EMPTY_VISUAL_IDENTITY,
    clothing: '',
    appearance_details: '',
    screenplay_character_id: null,
    role: '',
    age_range: '',
    continuity_rules: '',
    reference_image_prompt: '',
    voice_description: '',
    dialogue_style: '',
    in_library: false,
    primary_reference_asset_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildProjectFlowGenerationPackage', () => {
  it('associates scene-specific character references and reports missing refs', () => {
    const screenplay = createSampleScreenplay();
    const scenes: GenerationSceneRecord[] = screenplay.scenes.map((scene) => ({
      id: `s${scene.scene_number}`,
      projectId: 'p1',
      sceneNumber: scene.scene_number,
      title: scene.title,
      state: 'PROMPT_READY',
      durationSeconds: scene.duration_seconds,
      flowPrompt: scene.flow_prompt,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    const stored = [
      character({
        id: 'c1',
        name: 'Rina',
        screenplay_character_id: 'rina',
        visual_identity: 'amber jacket',
        continuity_rules: 'Always amber jacket',
        primary_reference_asset_id: 'ref1',
      }),
      character({
        id: 'c2',
        name: 'The Chip',
        screenplay_character_id: 'the-chip',
        visual_identity: 'cyan glow',
      }),
    ];

    const pkg = buildProjectFlowGenerationPackage({
      projectId: 'p1',
      projectName: 'Night Run',
      screenplay,
      scenes,
      characters: stored,
      env: { FLOW_PROVIDER: 'google-flow-manual', NODE_ENV: 'test' },
    });

    expect(pkg.provider).toBe('google-flow-manual');
    expect(pkg.scenes).toHaveLength(5);
    expect(pkg.scenes[0]?.characterReferences.map((r) => r.characterId).sort()).toEqual([
      'rina',
      'the-chip',
    ]);
    expect(pkg.scenes[1]?.characterReferences.map((r) => r.characterId)).toEqual(['rina']);
    expect(pkg.scenes[0]?.continuityPrompt).toMatch(/Always amber jacket/);
    expect(pkg.scenes[0]?.combinedPrompt).toContain(pkg.scenes[0]!.flowPrompt);
    expect(pkg.scenes[0]?.characterReferences.find((r) => r.characterId === 'the-chip')?.missingReference).toBe(
      true,
    );
    expect(charactersMissingReferences(stored)).toHaveLength(1);
  });

  it('manifest export stays stable via package helper', () => {
    const pkg = buildFlowGenerationPackage({
      projectId: 'p1',
      scenes: [{ sceneNumber: 1, title: 'One', flowPrompt: 'x' }],
    });
    expect(pkg.scenes[0]?.completionStatus).toBe('PROMPT_READY');
  });
});
