import { describe, expect, it } from 'vitest';
import { buildFlowGenerationPackage } from '@ai-shorts-factory/flow-adapter';
import { buildProjectFlowGenerationPackage } from './flow-package.js';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

function sampleScreenplay(): ScreenplayV1 {
  return {
    schema_version: '1.0.0',
    title: 'Night Run',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    story_summary: 'Courier story',
    hook: 'A package whispers',
    characters: [
      {
        name: 'Rina',
        description: 'Night courier',
        visual_identity: 'short black hair, amber jacket',
      },
    ],
    scenes: [1, 2, 3, 4, 5].map((n) => ({
      scene_number: n,
      title: `Scene ${n}`,
      duration_seconds: 8,
      visual_description: `Visual ${n}`,
      flow_prompt: `Prompt ${n}`,
      narration: '',
      dialogue: '',
      text_overlay: '',
      transition_out: 'cut',
    })),
    ending: 'Dawn',
    publishing_metadata: { title: 'Night Run', description: 'Short', tags: [] },
  };
}

describe('buildProjectFlowGenerationPackage', () => {
  it('builds prompts from screenplay without marking scenes generated', () => {
    const screenplay = sampleScreenplay();
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

    const pkg = buildProjectFlowGenerationPackage({
      projectId: 'p1',
      projectName: 'Night Run',
      screenplay,
      scenes,
      env: { FLOW_PROVIDER: 'google-flow-manual', NODE_ENV: 'test' },
    });

    expect(pkg.provider).toBe('google-flow-manual');
    expect(pkg.scenes).toHaveLength(5);
    expect(pkg.scenes.every((scene) => scene.completionStatus === 'PROMPT_READY')).toBe(true);
    expect(pkg.scenes[0]?.characterReferences[0]?.name).toBe('Rina');
    expect(pkg.scenes.every((scene) => scene.flowPrompt.startsWith('Prompt'))).toBe(true);
  });

  it('manifest export stays stable via package helper', () => {
    const pkg = buildFlowGenerationPackage({
      projectId: 'p1',
      scenes: [{ sceneNumber: 1, title: 'One', flowPrompt: 'x' }],
    });
    expect(pkg.scenes[0]?.completionStatus).toBe('PROMPT_READY');
  });
});
