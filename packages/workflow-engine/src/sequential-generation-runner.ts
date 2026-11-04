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
import { resolveEffectiveMaxScenes } from './generation-types.js';
import {
  releaseLiveGenerationSlot,
  tryAcquireLiveGenerationSlot,
} from './live-generation-lock.js';

export type SceneGenerationResult =
  | { status: 'completed'; scene: GenerationSceneRecord }
  | { status: 'failed'; scene: GenerationSceneRecord; pauseProject: true; message: string }
  | { status: 'skipped'; scene: GenerationSceneRecord };

const BLOCKING_RETRY_STATES = new Set([
  'UNKNOWN_SUBMISSION',
  'DOWNLOAD_FAILED',
  'VERIFICATION_FAILED',
  'NEEDS_ATTENTION',
]);

/**
 * Sequential mock/live-capable scene generation.
 * Never auto-retries failed scenes. Never regenerates completed scenes.
 * Never blindly re-submits after an uncertain Flow click.
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
    this.assertSpendConfirmation(options);

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

    const maxScenes = resolveEffectiveMaxScenes(options);
    let attempted = 0;

    for (const scene of scenes.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      if (scene.state === 'COMPLETED') {
        continue;
      }
      if (typeof maxScenes === 'number' && attempted >= maxScenes) {
        break;
      }

      if (scene.state === 'SUBMITTING') {
        await this.store.updateScene(userId, projectId, scene.id, {
          state: 'UNKNOWN_SUBMISSION',
          errorMessage:
            'Worker interrupted while submitting to Flow. Treat credit consumption as unknown until reconciled.',
          submissionAttempted: true,
        });
        await this.store.setProjectWorkflowState(userId, projectId, 'PAUSED');
        return {
          completed,
          failed: `Scene ${scene.sceneNumber} left in SUBMITTING — marked UNKNOWN_SUBMISSION. Manual reconciliation required.`,
        };
      }

      if (scene.submissionAttempted && BLOCKING_RETRY_STATES.has(scene.state)) {
        await this.store.setProjectWorkflowState(userId, projectId, 'PAUSED');
        return {
          completed,
          failed: `Scene ${scene.sceneNumber} is ${scene.state}. Manual reconciliation and explicit retry confirmation required — refusing automatic re-submit.`,
        };
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

    // Partial runs (canary / single-scene verify) pause for operator review.
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
    this.assertSpendConfirmation(options);

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

    if (scene.submissionAttempted && scene.state === 'UNKNOWN_SUBMISSION') {
      if (!options.unknownSubmissionReconciled) {
        throw new Error(
          'Scene has UNKNOWN_SUBMISSION. Reconcile credits against the Google Flow account, then retry only with unknownSubmissionReconciled=true.',
        );
      }
      if (options.requireSpendConfirmation && !options.spendConfirmationAccepted) {
        throw new Error(
          'Scene has UNKNOWN_SUBMISSION. Explicit spend confirmation is still required before another paid attempt.',
        );
      }
    }

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

  private assertSpendConfirmation(options: GenerationRunnerOptions): void {
    if (options.requireSpendConfirmation && !options.spendConfirmationAccepted) {
      throw new Error(
        'Live Google Flow spend requires explicit operator confirmation (preflight token + SPEND_REAL_CREDITS). Refusing to start.',
      );
    }
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
    const aspectRatio = options.aspectRatio ?? BUSINESS_DEFAULTS.defaultGenerationAspectRatio;
    const assetOrigin = options.assetOrigin ?? 'MOCK';
    const attemptId = randomUUID();
    const idempotencyKey = `${projectId}:scene:${scene.sceneNumber}:attempt:${attemptId}`;

    const liveLockNeeded = assetOrigin === 'REAL_GENERATED' || options.requireSpendConfirmation;
    if (liveLockNeeded) {
      const acquired = tryAcquireLiveGenerationSlot(
        BUSINESS_DEFAULTS.maxSimultaneousLiveGenerations,
      );
      if (!acquired) {
        const working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'NEEDS_ATTENTION',
          errorMessage: 'Another live generation is already in progress (max simultaneous = 1)',
        });
        return {
          status: 'failed',
          scene: working,
          pauseProject: true,
          message: working.errorMessage ?? 'Live concurrency lock held',
        };
      }
    }

    try {
      let working = await this.store.updateScene(userId, projectId, scene.id, {
        state: 'GENERATING',
        errorMessage: undefined,
        submissionId: undefined,
        reservationId: undefined,
        assetStorageKey: undefined,
        assetChecksum: undefined,
        assetMetadata: undefined,
        idempotencyKey,
        submissionAttempted: false,
        assetOrigin,
      });

      const reservation = await this.credits.reserve({
        userId,
        amount: estimatedCost,
        projectId,
        idempotencyKey: `reserve:${idempotencyKey}`,
        metadata: { sceneNumber: scene.sceneNumber, attemptId, assetOrigin },
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
      let submitClicked = false;
      try {
        const config = await this.provider.validateConfiguration();
        if (!config.ok) {
          throw new Error(config.message);
        }
        await this.provider.prepareSession();

        // Persist submission intent BEFORE interacting with Flow Generate.
        // If the process dies here, restart promotes SUBMITTING → UNKNOWN_SUBMISSION.
        working = await this.store.updateScene(userId, projectId, scene.id, {
          state: 'SUBMITTING',
          submissionAttempted: false,
          idempotencyKey,
        });

        const submission = await this.provider.submitGeneration({
          idempotencyKey,
          prompt: scene.flowPrompt,
          model,
          durationSeconds,
          resolution,
          aspectRatio,
          referenceAssetPaths: options.referenceAssetPaths,
        });
        submissionId = submission.submissionId;
        submitClicked = true;

        working = await this.store.updateScene(userId, projectId, scene.id, {
          submissionId,
          state: 'GENERATING',
          submissionAttempted: true,
        });

        if (
          options.failOnSceneNumber === scene.sceneNumber &&
          options.failMode === 'after_submit_uncertain'
        ) {
          await this.credits.markUnknown(reservation.id, {
            reason: 'injected_uncertain_after_submit',
          });
          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: 'UNKNOWN_SUBMISSION',
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
          await this.credits.markUnknown(reservation.id, {
            reason: 'generation_not_completed',
            status,
          });
          const attentionState =
            status.state === 'needs_human_intervention' ? 'NEEDS_ATTENTION' : 'UNKNOWN_SUBMISSION';
          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: attentionState,
            errorMessage:
              status.state === 'failed' || status.state === 'needs_human_intervention'
                ? status.message
                : 'Generation did not complete — do not assume zero credit cost',
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
            state: 'DOWNLOAD_FAILED',
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
          const localPath = join(tempRoot, `scene-${scene.sceneNumber}.mp4`);
          let downloaded;
          try {
            downloaded = await this.provider.downloadAsset(submission.submissionId, localPath);
          } catch (downloadError) {
            const message =
              downloadError instanceof Error ? downloadError.message : 'Download failed';
            await this.credits.markUnknown(reservation.id, {
              reason: 'download_failed',
              message,
            });
            working = await this.store.updateScene(userId, projectId, scene.id, {
              state: 'DOWNLOAD_FAILED',
              errorMessage: message,
            });
            return {
              status: 'failed',
              scene: working,
              pauseProject: true,
              message,
            };
          }

          if (downloaded.bytes <= 0) {
            await this.credits.markUnknown(reservation.id, { reason: 'empty_download' });
            working = await this.store.updateScene(userId, projectId, scene.id, {
              state: 'DOWNLOAD_FAILED',
              errorMessage: 'Downloaded asset is empty',
            });
            return {
              status: 'failed',
              scene: working,
              pauseProject: true,
              message: 'Downloaded asset is empty',
            };
          }

          const { readFile } = await import('node:fs/promises');
          const bytes = await readFile(downloaded.localPath);

          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: 'VERIFYING',
          });

          let assetMetadata: NonNullable<GenerationSceneRecord['assetMetadata']> = {
            bytes: downloaded.bytes,
            sha256: downloaded.sha256,
            contentType: downloaded.contentType,
            originalDownloadPreserved: true,
            probedAt: new Date().toISOString(),
          };

          if (options.verifyDownloadedAsset) {
            const verification = await options.verifyDownloadedAsset(downloaded.localPath);
            if (!verification.ok) {
              await this.credits.markUnknown(reservation.id, {
                reason: 'verification_failed',
                message: verification.reason,
              });
              working = await this.store.updateScene(userId, projectId, scene.id, {
                state: 'VERIFICATION_FAILED',
                errorMessage: verification.reason,
              });
              return {
                status: 'failed',
                scene: working,
                pauseProject: true,
                message: verification.reason,
              };
            }
            assetMetadata = {
              ...assetMetadata,
              durationSeconds: verification.durationSeconds,
              width: verification.width,
              height: verification.height,
              hasVideo: true,
            };
          }

          if (
            options.failOnSceneNumber === scene.sceneNumber &&
            options.failMode === 'verification'
          ) {
            await this.credits.markUnknown(reservation.id, {
              reason: 'injected_verification_failure',
            });
            working = await this.store.updateScene(userId, projectId, scene.id, {
              state: 'VERIFICATION_FAILED',
              errorMessage: 'Injected verification failure',
            });
            return {
              status: 'failed',
              scene: working,
              pauseProject: true,
              message: 'Injected verification failure',
            };
          }

          const extension = assetOrigin === 'REAL_GENERATED' ? 'mp4' : 'bin';
          const storageKey = `users/${userId}/projects/${projectId}/scenes/scene-${scene.sceneNumber}-${submission.submissionId}.${extension}`;
          const originalKey = `users/${userId}/projects/${projectId}/scenes/originals/scene-${scene.sceneNumber}-${submission.submissionId}.${extension}`;

          const stored = await this.storage.putObject({
            key: storageKey,
            body: bytes,
            contentType: downloaded.contentType,
            checksumSha256: downloaded.sha256,
          });

          // Preserve original download bytes under a separate key.
          await this.storage.putObject({
            key: originalKey,
            body: bytes,
            contentType: downloaded.contentType,
            checksumSha256: downloaded.sha256,
          });

          const observed = await this.provider.getObservedCreditCost(submission.submissionId);
          // Never confirm estimated/reserved amounts as actual spend.
          if (observed === 'unknown' || typeof observed !== 'number' || !Number.isFinite(observed)) {
            await this.credits.markUnknown(reservation.id, {
              reason: 'provider_unknown_cost',
              submissionId: submission.submissionId,
              estimatedCost,
            });
          } else {
            await this.credits.confirmSpend(reservation.id, observed, {
              submissionId: submission.submissionId,
              observedCost: observed,
              estimatedCost,
            });
          }

          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: 'COMPLETED',
            assetStorageKey: stored.key,
            assetChecksum: stored.checksumSha256,
            assetOrigin,
            assetMetadata,
            errorMessage: undefined,
          });

          return { status: 'completed', scene: working };
        } finally {
          await rm(tempRoot, { recursive: true, force: true });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scene generation failed';
        if (submissionId || submitClicked) {
          await this.credits.markUnknown(reservation.id, {
            reason: 'exception_after_submit',
            message,
          });
          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: 'UNKNOWN_SUBMISSION',
            errorMessage: message,
            submissionId,
            submissionAttempted: true,
          });
        } else if (working.state === 'SUBMITTING') {
          // Uncertain whether Generate was clicked (UI drift / crash during submit call).
          await this.credits.markUnknown(reservation.id, {
            reason: 'uncertain_during_submit',
            message,
          });
          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: 'UNKNOWN_SUBMISSION',
            errorMessage: message,
            submissionAttempted: true,
          });
        } else {
          await this.credits.releaseReservation(reservation.id, {
            reason: 'exception_before_submit',
            message,
          });
          working = await this.store.updateScene(userId, projectId, scene.id, {
            state: 'FAILED',
            errorMessage: message,
            submissionId,
          });
        }
        return {
          status: 'failed',
          scene: working,
          pauseProject: true,
          message,
        };
      }
    } finally {
      if (liveLockNeeded) {
        releaseLiveGenerationSlot();
      }
    }
  }
}

/** Ensure temp directory helpers are tree-shaken friendly for tests. */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
