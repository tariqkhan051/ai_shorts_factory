import { describe, expect, it } from 'vitest';
import {
  buildFlowGenerationPackage,
  exportFlowGenerationManifest,
} from './manual-generation-package.js';
import {
  assertManualSceneTransition,
  canTransitionManualScene,
} from './manual-scene-transitions.js';
import { GoogleFlowManualProvider } from './google-flow-manual-provider.js';
import { createVideoGenerationProvider } from './create-provider.js';

describe('buildFlowGenerationPackage', () => {
  it('creates a five-scene prompt package without marking scenes generated', () => {
    const pkg = buildFlowGenerationPackage({
      projectId: 'proj-1',
      projectName: 'Canary',
      characterReferences: [
        {
          name: 'Rina',
          visualIdentity: 'night courier',
          flowLibraryHint: 'rina-courier-reference',
        },
      ],
      scenes: [1, 2, 3, 4, 5].map((n) => ({
        sceneNumber: n,
        title: `Scene ${n}`,
        flowPrompt: `Prompt for scene ${n}`,
      })),
    });

    expect(pkg.provider).toBe('google-flow-manual');
    expect(pkg.scenes).toHaveLength(5);
    expect(pkg.scenes.every((scene) => scene.completionStatus === 'PROMPT_READY')).toBe(true);
    expect(pkg.scenes[0]?.characterReferences[0]?.flowLibraryHint).toBe('rina-courier-reference');
    expect(pkg.estimatedProjectCost).toBe(50);
    expect(pkg.operatorNotes.join(' ')).toMatch(/never controls Google Flow/i);
  });

  it('exports a JSON manifest', () => {
    const pkg = buildFlowGenerationPackage({
      projectId: 'proj-1',
      scenes: [{ sceneNumber: 1, title: 'One', flowPrompt: 'hello' }],
    });
    const json = exportFlowGenerationManifest(pkg);
    const parsed = JSON.parse(json) as { provider: string; scenes: unknown[] };
    expect(parsed.provider).toBe('google-flow-manual');
    expect(parsed.scenes).toHaveLength(1);
  });
});

describe('manual scene transitions', () => {
  it('allows prompt-ready → awaiting, and forbids copy-as-generated shortcut', () => {
    expect(canTransitionManualScene('PROMPT_READY', 'AWAITING_MANUAL_GENERATION')).toBe(true);
    expect(canTransitionManualScene('PROMPT_READY', 'REAL_GENERATED')).toBe(false);
    expect(canTransitionManualScene('PROMPT_READY', 'COMPLETED')).toBe(false);
    expect(() => assertManualSceneTransition('PROMPT_READY', 'REAL_GENERATED')).toThrow(
      /Illegal manual scene transition/,
    );
  });

  it('requires verification before REAL_GENERATED', () => {
    expect(canTransitionManualScene('UPLOADED_PENDING_VERIFICATION', 'REAL_GENERATED')).toBe(
      true,
    );
    expect(canTransitionManualScene('AWAITING_MANUAL_GENERATION', 'REAL_GENERATED')).toBe(false);
  });
});

describe('assembly state helpers', () => {
  it('keeps COMPLETED mock-only and REAL_GENERATED real-only', async () => {
    const { isMockAssemblyState, isRealAssemblyState, isSceneReadyForAssembly } = await import(
      './manual-generation-package.js'
    );
    expect(isMockAssemblyState('COMPLETED')).toBe(true);
    expect(isMockAssemblyState('REAL_GENERATED')).toBe(false);
    expect(isRealAssemblyState('REAL_GENERATED')).toBe(true);
    expect(isRealAssemblyState('COMPLETED')).toBe(false);
    expect(isSceneReadyForAssembly('COMPLETED')).toBe(true);
    expect(isSceneReadyForAssembly('PROMPT_READY')).toBe(false);
  });
});

describe('GoogleFlowManualProvider', () => {
  it('never completes generation or downloads assets', async () => {
    const provider = new GoogleFlowManualProvider();
    expect(provider.name).toBe('google-flow-manual');
    const submission = await provider.submitGeneration({
      idempotencyKey: 'k1',
      prompt: 'test',
      model: 'Veo 3.1 - Lite',
      durationSeconds: 8,
      resolution: '720p',
    });
    const status = await provider.getGenerationStatus(submission.submissionId);
    expect(status.state).toBe('needs_human_intervention');
    await expect(provider.downloadAsset(submission.submissionId, '/tmp/x.mp4')).rejects.toThrow(
      /cannot download/i,
    );
    expect(await provider.getObservedCreditCost(submission.submissionId)).toBe('unknown');
  });

  it('is constructed via createVideoGenerationProvider', () => {
    const provider = createVideoGenerationProvider({
      env: { FLOW_PROVIDER: 'google-flow-manual', NODE_ENV: 'test' },
    });
    expect(provider).toBeInstanceOf(GoogleFlowManualProvider);
  });

  it('refuses Playwright automation without explicit opt-in', () => {
    expect(() =>
      createVideoGenerationProvider({
        env: {
          FLOW_PROVIDER: 'google-flow',
          FLOW_LIVE_ENABLED: 'true',
          NODE_ENV: 'development',
        },
      }),
    ).toThrow(/disabled by default/i);
  });
});
