import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryCreditLedger } from '@ai-shorts-factory/credit-manager';
import { MockVideoGenerationProvider } from '@ai-shorts-factory/flow-adapter';
import { MemoryObjectStorage } from '@ai-shorts-factory/storage';
import { SCREENPLAY_SCHEMA_VERSION, type ScreenplayV1 } from '@ai-shorts-factory/validation';
import { resolveEffectiveMaxScenes } from './generation-types.js';
import {
  getActiveLiveGenerationCount,
  resetLiveGenerationSlotsForTests,
  tryAcquireLiveGenerationSlot,
  releaseLiveGenerationSlot,
} from './live-generation-lock.js';
import { MemoryGenerationStore } from './memory-generation-store.js';
import { SequentialGenerationRunner } from './sequential-generation-runner.js';

function sampleScreenplay(): ScreenplayV1 {
  return {
    schema_version: SCREENPLAY_SCHEMA_VERSION,
    title: 'Safety Audit',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    story_summary: 'Canary safety screenplay',
    hook: 'Open',
    characters: [{ name: 'Ava', description: 'Lead', visual_identity: 'Red coat' }],
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
    publishing_metadata: { title: 'Safety', description: 'Test', tags: ['audit'] },
  };
}

describe('live canary safety audit', () => {
  const store = new MemoryGenerationStore();
  const credits = new MemoryCreditLedger({ dailyBudget: 50 });
  const storage = new MemoryObjectStorage();
  const provider = new MockVideoGenerationProvider({ costPerGeneration: 10 });
  const runner = new SequentialGenerationRunner(store, credits, provider, storage);
  const userId = 'audit-user';
  const projectId = 'audit-project';
  let lockDir = '';

  beforeEach(async () => {
    store.clear();
    credits.clear();
    storage.clear();
    resetLiveGenerationSlotsForTests();
    lockDir = await mkdtemp(join(tmpdir(), 'asf-lock-'));
    process.env.FLOW_LIVE_LOCK_PATH = join(lockDir, 'live.lock');
    store.seed({
      projectId,
      userId,
      workflowState: 'SCENE_PREPARATION',
      screenplay: sampleScreenplay(),
    });
  });

  afterEach(() => {
    resetLiveGenerationSlotsForTests();
    delete process.env.FLOW_LIVE_LOCK_PATH;
  });

  it('1. canary/live without unlock cannot generate more than one scene', async () => {
    expect(
      resolveEffectiveMaxScenes({
        workerId: 'w',
        assetOrigin: 'REAL_GENERATED',
        maxScenes: 5,
      }),
    ).toBe(1);

    const result = await runner.runProject(userId, projectId, {
      workerId: 'w',
      assetOrigin: 'REAL_GENERATED',
      requireSpendConfirmation: true,
      spendConfirmationAccepted: true,
      // Intentionally omit maxScenes — must still cap at 1.
    });
    expect(result.completed).toBe(1);
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.scenes.filter((s) => s.state === 'COMPLETED')).toHaveLength(1);
    expect(snapshot.scenes.find((s) => s.sceneNumber === 2)?.state).toBe('PENDING');
  });

  it('2. concurrent requests cannot bypass the generation lock', async () => {
    expect(tryAcquireLiveGenerationSlot(1)).toBe(true);
    expect(tryAcquireLiveGenerationSlot(1)).toBe(false);
    expect(getActiveLiveGenerationCount()).toBe(1);

    const blocked = runner.runProject(userId, projectId, {
      workerId: 'w2',
      assetOrigin: 'REAL_GENERATED',
      requireSpendConfirmation: true,
      spendConfirmationAccepted: true,
      maxScenes: 1,
    });
    const outcome = await blocked;
    expect(outcome.failed).toMatch(/already in progress|concurrency/i);
    releaseLiveGenerationSlot();
  });

  it('3. persisted SUBMITTING cannot be submitted again after restart', async () => {
    await store.ensureScenesFromScreenplay(userId, projectId, sampleScreenplay());
    const scenes = (await store.getProjectSnapshot(userId, projectId)).scenes;
    const scene1 = scenes.find((s) => s.sceneNumber === 1)!;
    await store.updateScene(userId, projectId, scene1.id, {
      state: 'SUBMITTING',
      submissionAttempted: false,
      idempotencyKey: 'proj:scene:1:attempt:crash',
    });

    const restarted = await runner.runProject(userId, projectId, {
      workerId: 'restart',
      assetOrigin: 'REAL_GENERATED',
      requireSpendConfirmation: true,
      spendConfirmationAccepted: true,
      maxScenes: 1,
    });
    expect(restarted.failed).toMatch(/UNKNOWN_SUBMISSION|SUBMITTING/i);
    const after = await store.getProjectSnapshot(userId, projectId);
    expect(after.scenes[0]?.state).toBe('UNKNOWN_SUBMISSION');
    expect(after.scenes[0]?.submissionAttempted).toBe(true);
  });

  it('4. UNKNOWN_SUBMISSION requires explicit reconciliation flag', async () => {
    await runner.runProject(userId, projectId, {
      workerId: 'w',
      failOnSceneNumber: 1,
      failMode: 'after_submit_uncertain',
    });

    await expect(
      runner.retryScene(userId, projectId, 1, {
        workerId: 'w',
        spendConfirmationAccepted: true,
        requireSpendConfirmation: true,
      }),
    ).rejects.toThrow(/unknownSubmissionReconciled/i);

    await expect(
      runner.retryScene(userId, projectId, 1, {
        workerId: 'w',
        unknownSubmissionReconciled: true,
        requireSpendConfirmation: true,
        spendConfirmationAccepted: false,
      }),
    ).rejects.toThrow(/explicit operator confirmation|spend confirmation/i);
  });

  it('5–6. spend confirmation + live options gate paid runs', async () => {
    await expect(
      runner.runProject(userId, projectId, {
        workerId: 'w',
        requireSpendConfirmation: true,
        spendConfirmationAccepted: false,
        assetOrigin: 'REAL_GENERATED',
      }),
    ).rejects.toThrow(/explicit operator confirmation/i);
  });

  it('7. mock mode does not require live spend gates and stays MOCK', async () => {
    const result = await runner.runProject(userId, projectId, {
      workerId: 'w',
      assetOrigin: 'MOCK',
    });
    expect(result.completed).toBe(5);
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.scenes.every((s) => s.assetOrigin === 'MOCK')).toBe(true);
  });

  it('9–10. durable storage precedes COMPLETED; unknown cost is never confirmed', async () => {
    const unknownProvider = new MockVideoGenerationProvider({ costPerGeneration: 10 });
    // Force unknown observed cost by wrapping getObservedCreditCost.
    unknownProvider.getObservedCreditCost = async () => 'unknown';
    const unknownRunner = new SequentialGenerationRunner(store, credits, unknownProvider, storage);

    const result = await unknownRunner.runProject(userId, projectId, {
      workerId: 'w',
      maxScenes: 1,
      assetOrigin: 'MOCK',
    });
    expect(result.completed).toBe(1);
    const balances = await credits.getBalances(userId);
    expect(balances.confirmedSpent).toBe(0);
    expect(balances.unknownConsumption).toBe(10);
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    const scene = snapshot.scenes[0]!;
    expect(scene.state).toBe('COMPLETED');
    expect(scene.assetStorageKey).toBeTruthy();
    const object = await storage.getObject(scene.assetStorageKey!);
    expect(object?.body.byteLength).toBeGreaterThan(0);
  });

  it('11. failed generation does not automatically continue to next paid scene', async () => {
    const result = await runner.runProject(userId, projectId, {
      workerId: 'w',
      assetOrigin: 'REAL_GENERATED',
      requireSpendConfirmation: true,
      spendConfirmationAccepted: true,
      failOnSceneNumber: 1,
      failMode: 'before_submit',
    });
    expect(result.completed).toBe(0);
    expect(result.failed).toBeTruthy();
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.scenes.filter((s) => s.state === 'COMPLETED')).toHaveLength(0);
    expect(snapshot.scenes.find((s) => s.sceneNumber === 2)?.state).toBe('PENDING');
  });

  it('12. five-scene live remains locked until allowFullLiveProject', async () => {
    expect(
      resolveEffectiveMaxScenes({
        workerId: 'w',
        assetOrigin: 'REAL_GENERATED',
        allowFullLiveProject: true,
        maxScenes: 5,
      }),
    ).toBe(5);

    const locked = await runner.runProject(userId, projectId, {
      workerId: 'w',
      assetOrigin: 'REAL_GENERATED',
      requireSpendConfirmation: true,
      spendConfirmationAccepted: true,
      allowFullLiveProject: false,
      maxScenes: 5,
    });
    expect(locked.completed).toBe(1);
  });

  it('download failure marks DOWNLOAD_FAILED and does not complete', async () => {
    const result = await runner.runProject(userId, projectId, {
      workerId: 'w',
      maxScenes: 1,
      failOnSceneNumber: 1,
      failMode: 'download',
    });
    expect(result.failed).toMatch(/download/i);
    const snapshot = await store.getProjectSnapshot(userId, projectId);
    expect(snapshot.scenes[0]?.state).toBe('DOWNLOAD_FAILED');
  });
});

describe('spend confirmation server-side (flow-adapter)', () => {
  it('rejects wrong phrase even with matching token', async () => {
    const { assertLiveSpendConfirmation, createLiveSpendConfirmation } = await import(
      '@ai-shorts-factory/flow-adapter'
    );
    const confirmation = createLiveSpendConfirmation({
      projectId: 'p',
      sceneNumber: 1,
      prompt: 'x',
      model: 'm',
      aspectRatio: '9:16',
      resolution: '720p',
      durationSeconds: 6,
      estimatedCreditCost: 'unknown',
    });
    expect(() =>
      assertLiveSpendConfirmation({
        confirmation,
        projectId: 'p',
        sceneNumber: 1,
        typedPhrase: 'yes please',
        providedToken: confirmation.token,
      }),
    ).toThrow(/SPEND_REAL_CREDITS/);
  });
});
