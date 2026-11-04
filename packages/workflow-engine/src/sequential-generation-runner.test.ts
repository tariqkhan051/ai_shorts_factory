import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryCreditLedger } from '@ai-shorts-factory/credit-manager';
import { MockVideoGenerationProvider } from '@ai-shorts-factory/flow-adapter';
import { MemoryObjectStorage } from '@ai-shorts-factory/storage';
import { SCREENPLAY_SCHEMA_VERSION, type ScreenplayV1 } from '@ai-shorts-factory/validation';
import { MemoryGenerationStore } from './memory-generation-store.js';
import { SequentialGenerationRunner } from './sequential-generation-runner.js';

function sampleScreenplay(): ScreenplayV1 {
  return {
    schema_version: SCREENPLAY_SCHEMA_VERSION,
    title: 'Mock Five',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    story_summary: 'Five beat mock story',
    hook: 'Open hard',
    characters: [
      {
        name: 'Ava',
        description: 'Lead',
        visual_identity: 'Red coat',
      },
    ],
    scenes: [1, 2, 3, 4, 5].map((n) => ({
      scene_number: n,
      title: `Scene ${n}`,
      duration_seconds: 6,
      visual_description: `Visual ${n}`,
      flow_prompt: `Prompt ${n}`,
      narration: '',
      dialogue: '',
      text_overlay: '',
      transition_out: 'cut',
    })),
    ending: 'Done',
    publishing_metadata: {
      title: 'Mock Five',
      description: 'Test',
      tags: ['test'],
    },
  };
}

describe('SequentialGenerationRunner', () => {
  const store = new MemoryGenerationStore();
  const credits = new MemoryCreditLedger({ dailyBudget: 50 });
  const storage = new MemoryObjectStorage();
  const provider = new MockVideoGenerationProvider({ costPerGeneration: 10 });
  const runner = new SequentialGenerationRunner(store, credits, provider, storage);
  const userId = 'user-1';
  const projectId = 'project-1';

  beforeEach(() => {
    store.clear();
    credits.clear();
    storage.clear();
    store.seed({
      projectId,
      userId,
      workflowState: 'SCENE_PREPARATION',
      screenplay: sampleScreenplay(),
    });
  });

  it('generates five scenes sequentially and reaches ASSEMBLY_READY', async () => {
    const result = await runner.runProject(userId, projectId, { workerId: 'test-worker' });
    expect(result.completed).toBe(5);
    expect(result.failed).toBeUndefined();

    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.workflowState).toBe('ASSEMBLY_READY');
    expect(snapshot.scenes.every((scene) => scene.state === 'COMPLETED')).toBe(true);

    const balances = await credits.getBalances(userId);
    expect(balances.confirmedSpent).toBe(50);
    expect(balances.spendable).toBe(0);
  });

  it('pauses on failure, preserves completed scenes, and supports manual retry', async () => {
    const failed = await runner.runProject(userId, projectId, {
      workerId: 'test-worker',
      failOnSceneNumber: 3,
      failMode: 'before_submit',
    });
    expect(failed.completed).toBe(2);
    expect(failed.failed).toMatch(/Injected failure/i);

    let snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.workflowState).toBe('PAUSED');
    expect(snapshot.scenes.filter((scene) => scene.state === 'COMPLETED')).toHaveLength(2);

    const retried = await runner.retryScene(userId, projectId, 3, { workerId: 'test-worker' });
    expect(retried.status).toBe('completed');

    // Continue remaining scenes manually via full runner resume semantics:
    const resumed = await runner.runProject(userId, projectId, { workerId: 'test-worker' });
    expect(resumed.completed).toBe(5);
    snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.scenes.every((scene) => scene.state === 'COMPLETED')).toBe(true);
  });

  it('does not reclaim spendable credits on uncertain post-submit failure', async () => {
    await runner.runProject(userId, projectId, {
      workerId: 'test-worker',
      failOnSceneNumber: 1,
      failMode: 'after_submit_uncertain',
    });
    const balances = await credits.getBalances(userId);
    expect(balances.unknownConsumption).toBe(10);
    expect(balances.confirmedSpent).toBe(0);
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.scenes[0]?.state).toBe('UNKNOWN_SUBMISSION');
  });

  it('enforces canary maxScenes=1 and does not continue to scene 2', async () => {
    const result = await runner.runProject(userId, projectId, {
      workerId: 'test-worker',
      maxScenes: 1,
      assetOrigin: 'MOCK',
    });
    expect(result.completed).toBe(1);
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.workflowState).toBe('PAUSED');
    expect(snapshot.scenes.filter((scene) => scene.state === 'COMPLETED')).toHaveLength(1);
    expect(snapshot.scenes.find((scene) => scene.sceneNumber === 2)?.state).toBe('PENDING');
  });

  it('refuses live spend without explicit confirmation', async () => {
    await expect(
      runner.runProject(userId, projectId, {
        workerId: 'test-worker',
        maxScenes: 1,
        requireSpendConfirmation: true,
        spendConfirmationAccepted: false,
        assetOrigin: 'REAL_GENERATED',
      }),
    ).rejects.toThrow(/explicit operator confirmation/i);
  });

  it('refuses automatic retry of UNKNOWN_SUBMISSION without confirmation', async () => {
    await runner.runProject(userId, projectId, {
      workerId: 'test-worker',
      failOnSceneNumber: 1,
      failMode: 'after_submit_uncertain',
    });
    const blocked = await runner.runProject(userId, projectId, { workerId: 'test-worker' });
    expect(blocked.failed).toMatch(/UNKNOWN_SUBMISSION/i);
  });
});
