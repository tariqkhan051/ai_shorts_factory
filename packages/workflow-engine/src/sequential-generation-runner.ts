import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CreditLedger } from '@ai-shorts-factory/credit-manager';
import type { VideoGenerationProvider } from '@ai-shorts-factory/flow-adapter';
import { BUSINESS_DEFAULTS, type WorkflowState } from '@ai-shorts-factory/shared-types';
import type { ObjectStorage } from '@ai-shorts-factory/storage';
import type {
  GenerationRunnerOptions,
  GenerationSceneRecord,
  GenerationStore,
} from './generation-types.js';

export type SceneGenerationResult =
  | { status: 'completed'; scene: GenerationSceneRecord }
  | { status: 'failed'; scene: GenerationSceneRecord; pauseProject: true; message: string }
  | { status: 'skipped'; scene: GenerationSceneRecord };

/**
 * Sequential mock/live-capable scene generation.
 * Never auto-retries failed scenes. Never regenerates completed scenes.
 */
export class SequentialGenerationRunner {
  constructor(
    private readonly store: GenerationStore,
    private readonly credits: CreditLedger,
    private readonly provider: VideoGenerationProvider,
    private readonly storage: ObjectStorage,
  ) {}

  async runProject(
    userId: string,
    projectId: string,
    options: GenerationRunnerOptions,
  ): Promise<{ completed: number; failed?: string }> {
    const snapshot = await this.store.getProjectSnapshot(userId, projectId);
    const scenes = await this.store.ensureScenesFromScreenplay(
      userId,
      projectId,
      snapshot.screenplay,
    );

    let completed = scenes.filter((scene) => scene.state === 'COMPLETED').length;
    if (completed === BUSINESS_DEFAULTS.sceneCount) {
      await this.reachAssemblyReady(userId, projectId, snapshot.workflowState);
      return { completed };
    }

    const availability = await this.provider.checkAvailability();
    if (!availability.available) {
      await this.store.setProjectWorkflowState(userId, projectId, 'NEEDS_HUMAN_INTERVENTION');
      throw new Error(`Provider unavailable: ${availability.message}`);
    }

    await this.reachGeneratingScenes(userId, projectId, snapshot.workflowState);

    const maxScenes = options.maxScenes;
    let attempted = 0;

    for (const scene of scenes.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      if (scene.state === 'COMPLETED') {
        continue;
      }
      if (typeof maxScenes === 'number' && attempted >= maxScenes) {
        break;
      }

      attempted += 1;
      const result = await this.runScene(userId, projectId, scene, options);
      if (result.status === 'completed') {
        completed += 1;
        continue;
      }
      if (result.status === 'failed') {
        await this.store.setProjectWorkflowState(userId, projectId, 'PAUSED');
        return { completed, failed: result.message };
      }
    }

    if (completed === BUSINESS_DEFAULTS.sceneCount) {
      await this.store.setProjectWorkflowState(userId, projectId, 'VERIFYING_SCENES');
      await this.store.setProjectWorkflowState(userId, projectId, 'ASSEMBLY_READY');
      return { completed };
    }

    // Partial runs (e.g. Phase 4 single-scene verify) pause for operator review.
    await this.store.setProjectWorkflowState(userId, projectId, 'PAUSED');
    if (typeof maxScenes === 'number' && attempted > 0 && !options.failOnSceneNumber) {
      return { completed };
    }
    return { completed, failed: 'Not all scenes completed' };
  }

  async retryScene(
    userId: string,
    projectId: string,
    sceneNumber: number,
    options: GenerationRunnerOptions,
  ): Promise<SceneGenerationResult> {
    const snapshot = await this.store.getProjectSnapshot(userId, projectId);
    const scenes = await this.store.ensureScenesFromScreenplay(
      userId,
      projectId,
      snapshot.screenplay,
    );
    const scene = scenes.find((item) => item.sceneNumber === sceneNumber);
    if (!scene) {
      throw new Error(`Scene ${sceneNumber} not found`);
    }
    if (scene.state === 'COMPLETED') {
      return { status: 'skipped', scene };
    }

    // Only earlier scenes that are completed (or this is scene 1) may proceed.
    const blockers = scenes.filter(
      (item) => item.sceneNumber < sceneNumber && item.state !== 'COMPLETED',
    );
    if (blockers.length > 0) {
      throw new Error('Cannot retry: earlier scenes are incomplete');
    }

    await this.store.setProjectWorkflowState(userId, projectId, 'GENERATING_SCENES');
    const result = await this.runScene(userId, projectId, scene, options);
    if (result.status === 'failed') {
      await this.store.setProjectWorkflowState(userId, projectId, 'PAUSED');
      return result;
    }

    const refreshed = await this.store.getProjectSnapshot(userId, projectId);
    const allDone = refreshed.scenes.every((item) => item.state === 'COMPLETED');
    if (allDone) {
      await this.store.setProjectWorkflowState(userId, projectId, 'VERIFYING_SCENES');
      await this.store.setProjectWorkflowState(userId, projectId, 'ASSEMBLY_READY');
    }
    return result;
  }

  private async reachGeneratingScenes(
    userId: string,
    projectId: string,
    from: WorkflowState,
  ): Promise<void> {
    if (from === 'GENERATING_SCENES') {
      return;
    }
    if (from === 'VERIFYING_SCENES') {
      await this.store.setProjectWorkflowState(userId, projectId, 'PAUSED');
      await this.store.setProjectWorkflowState(userId, projectId, 'GENERATING_SCENES');
      return;
    }
    if (from === 'CREDIT_RESERVED') {
      await this.store.setProjectWorkflowState(userId, projectId, 'GENERATING_SCENES');
      return;
    }
    if (from !== 'READY_FOR_GENERATION') {
      await this.store.setProjectWorkflowState(userId, projectId, 'READY_FOR_GENERATION');
    }
    await this.store.setProjectWorkflowState(userId, projectId, 'CREDIT_RESERVED');
    await this.store.setProjectWorkflowState(userId, projectId, 'GENERATING_SCENES');
  }

  private async reachAssemblyReady(
    userId: string,
    projectId: string,
    from: WorkflowState,
  ): Promise<void> {
    if (from === 'ASSEMBLY_READY') {
      return;
    }
    if (from === 'VERIFYING_SCENES') {
      await this.store.setProjectWorkflowState(userId, projectId, 'ASSEMBLY_READY');
      return;
    }
    if (from === 'GENERATING_SCENES') {
      await this.store.setProjectWorkflowState(userId, projectId, 'VERIFYING_SCENES');
      await this.store.setProjectWorkflowState(userId, projectId, 'ASSEMBLY_READY');
      return;
    }
    await this.reachGeneratingScenes(userId, projectId, from);
    await this.store.setProjectWorkflowState(userId, projectId, 'VERIFYING_SCENES');
    await this.store.setProjectWorkflowState(userId, projectId, 'ASSEMBLY_READY');
  }

  private async runScene(
    userId: string,
    projectId: string,
    scene: GenerationSceneRecord,
    options: GenerationRunnerOptions,
  ): Promise<SceneGenerationResult> {
    const estimatedCost = options.estimatedCostPerScene ?? BUSINESS_DEFAULTS.estimatedCostPerScene;
    const model = options.model ?? BUSINESS_DEFAULTS.defaultGenerationModel;
    const durationSeconds =
      options.durationSeconds ?? BUSINESS_DEFAULTS.defaultGenerationDurationSeconds;
    const resolution = options.resolution ?? BUSINESS_DEFAULTS.defaultGenerationResolution;
    // Fresh attempt id so manual retries never reuse a released/unknown reservation
    // or a prior provider submission idempotency key.
    const attemptId = randomUUID();
    const idempotencyKey = `${projectId}:scene:${scene.sceneNumber}:attempt:${attemptId}`;

    let working = await this.store.updateScene(userId, projectId, scene.id, {
      state: 'GENERATING',
      errorMessage: undefined,
      submissionId: undefined,
      reservationId: undefined,
      assetStorageKey: undefined,
      assetChecksum: undefined,
    });

    const reservation = await this.credits.reserve({
      userId,
      amount: estimatedCost,
      projectId,
      idempotencyKey: `reserve:${idempotencyKey}`,
      metadata: { sceneNumber: scene.sceneNumber, attemptId },
    });

    working = await this.store.updateScene(userId, projectId, scene.id, {
      reservationId: reservation.id,
    });

    if (options.failOnSceneNumber === scene.sceneNumber && options.failMode === 'before_submit') {
      await this.credits.releaseReservation(reservation.id, {
        reason: 'injected_before_submit',
      });
      working = await this.store.updateScene(userId, projectId, scene.id, {
        state: 'FAILED',
        errorMessage: 'Injected failure before submit',
      });
      return {
        status: 'failed',
        scene: working,
        pauseProject: true,
        message: working.errorMessage ?? 'Scene failed before submit',
      };
    }

    let submissionId: string | undefined;
    try {
      const config = await this.provider.validateConfiguration();
      if (!config.ok) {
        throw new Error(config.message);
      }
      await this.provider.prepareSession();

      const submission = await this.provider.submitGeneration({
        idempotencyKey,
        prompt: scene.flowPrompt,
        model,
        durationSeconds,
        resolution,
      });
      submissionId = submission.submissionId;

      working = await this.store.updateScene(userId, projectId, scene.id, {
        submissionId,
        state: 'GENERATING',
      });

      if (
        options.failOnSceneNumber === scene.sceneNumber &&
        options.failMode === 'after_submit_uncertain'
      ) {
        await this.credits.markUnknown(reservation.id, {
          reason: 'injected_uncertain_after_submit',
        });
        working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'NEEDS_ATTENTION',
          errorMessage: 'Injected uncertain failure after submit',
        });
        return {
          status: 'failed',
          scene: working,
          pauseProject: true,
          message: working.errorMessage ?? 'Uncertain generation failure',
        };
      }

      const status = await this.provider.waitForCompletion(submission.submissionId);
      if (status.state !== 'completed') {
        // Submission happened; do not assume zero cost.
        await this.credits.markUnknown(reservation.id, {
          reason: 'generation_not_completed',
          status,
        });
        working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'FAILED',
          errorMessage:
            status.state === 'failed' || status.state === 'needs_human_intervention'
              ? status.message
              : 'Generation did not complete',
        });
        return {
          status: 'failed',
          scene: working,
          pauseProject: true,
          message: working.errorMessage ?? 'Generation failed',
        };
      }

      working = await this.store.updateScene(userId, projectId, scene.id, {
        state: 'DOWNLOADING',
      });

      if (options.failOnSceneNumber === scene.sceneNumber && options.failMode === 'download') {
        await this.credits.markUnknown(reservation.id, { reason: 'injected_download_failure' });
        working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'FAILED',
          errorMessage: 'Injected download failure',
        });
        return {
          status: 'failed',
          scene: working,
          pauseProject: true,
          message: working.errorMessage ?? 'Download failed',
        };
      }

      const tempRoot = await mkdtemp(join(tmpdir(), 'asf-scene-'));
      try {
        const localPath = join(tempRoot, `scene-${scene.sceneNumber}.bin`);
        const downloaded = await this.provider.downloadAsset(submission.submissionId, localPath);
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(downloaded.localPath);

        working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'VERIFYING',
        });

        const storageKey = `users/${userId}/projects/${projectId}/scenes/scene-${scene.sceneNumber}-${submission.submissionId}.bin`;
        const stored = await this.storage.putObject({
          key: storageKey,
          body: bytes,
          contentType: downloaded.contentType,
          checksumSha256: downloaded.sha256,
        });

        const observed = await this.provider.getObservedCreditCost(submission.submissionId);
        if (observed === 'unknown') {
          await this.credits.markUnknown(reservation.id, { reason: 'provider_unknown_cost' });
        } else {
          await this.credits.confirmSpend(reservation.id, observed, {
            submissionId: submission.submissionId,
          });
        }

        working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'COMPLETED',
          assetStorageKey: stored.key,
          assetChecksum: stored.checksumSha256,
          errorMessage: undefined,
        });

        return { status: 'completed', scene: working };
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scene generation failed';
      if (submissionId) {
        await this.credits.markUnknown(reservation.id, {
          reason: 'exception_after_submit',
          message,
        });
      } else {
        await this.credits.releaseReservation(reservation.id, {
          reason: 'exception_before_submit',
          message,
        });
      }
      working = await this.store.updateScene(userId, projectId, scene.id, {
        state: submissionId ? 'NEEDS_ATTENTION' : 'FAILED',
        errorMessage: message,
        submissionId,
      });
      return {
        status: 'failed',
        scene: working,
        pauseProject: true,
        message,
      };
    }
  }
}

/** Ensure temp directory helpers are tree-shaken friendly for tests. */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
