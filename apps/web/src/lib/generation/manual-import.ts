import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertManualSceneTransition,
  isRealAssemblyState,
} from '@ai-shorts-factory/flow-adapter';
import {
  assertDecodableVideo,
  probeMedia,
  readMediaContractFromEnv,
  resolveMediaToolPaths,
  validateBytesAgainstContract,
  validateProbeAgainstContract,
} from '@ai-shorts-factory/media-engine';
import { planTransitionPath } from '@ai-shorts-factory/database';
import { BUSINESS_DEFAULTS, type SceneState, type WorkflowState } from '@ai-shorts-factory/shared-types';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';
import { findCrossProjectDuplicate, registerOrReuseAsset } from '@/lib/generation/asset-index';
import { evaluateAssemblyGate } from '@/lib/generation/assembly-gate';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import {
  createImportOperation,
  findCompletedImportBySha,
  updateImportOperation,
  withSceneImportLock,
} from '@/lib/generation/import-operation-store';
import { getCreditLedger } from '@/lib/generation/runtime';
import { emitProjectEvent, resolveVideoIdForProject } from '@/lib/n8n/emit';
import { getOrchestrationController } from '@/lib/n8n/runtime';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';
import { getObjectStorage } from '@/lib/storage';

export type ManualImportResult =
  | {
      ok: true;
      scene: GenerationSceneRecord;
      storageKey: string;
      sha256: string;
      reused: boolean;
      crossProjectContentReuse: boolean;
      probe: {
        durationSeconds: number;
        width: number | null;
        height: number | null;
        hasAudio: boolean;
        videoCodec: string | null;
      };
    }
  | { ok: false; reason: string; scene?: GenerationSceneRecord };

export async function markSceneAwaitingManualGeneration(
  userId: string,
  projectId: string,
  sceneId: string,
): Promise<GenerationSceneRecord> {
  const store = await createStore();
  const snapshot = await store.getProjectSnapshot(userId, projectId);
  const scene = snapshot.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error('Scene not found');
  }
  if (scene.state === 'PENDING') {
    await store.updateScene(userId, projectId, sceneId, { state: 'PROMPT_READY' });
  }
  const from: SceneState = scene.state === 'PENDING' ? 'PROMPT_READY' : scene.state;
  assertManualSceneTransition(from, 'AWAITING_MANUAL_GENERATION');
  const updated = await store.updateScene(userId, projectId, sceneId, {
    state: 'AWAITING_MANUAL_GENERATION',
    errorMessage: undefined,
  });
  await emitProjectEvent({
    userId,
    projectId,
    eventType: 'scene.awaiting_manual_generation',
    sceneId,
    idempotencyParts: [projectId, sceneId, 'awaiting', updated.state],
    status: {
      scene_number: updated.sceneNumber,
      scene_state: updated.state,
      flow_package_path: `/projects/${projectId}/flow-package`,
    },
  });
  try {
    const videoId = await resolveVideoIdForProject(userId, projectId);
    await getOrchestrationController().setWaiting(projectId, videoId, 'waiting_manual_generation', {
      sceneId,
      sceneNumber: updated.sceneNumber,
    });
  } catch {
    // orchestration UI patch is best-effort
  }
  return updated;
}

/**
 * Operator fix for Flow-rejected prompts.
 * Updates the generation scene and syncs the matching screenplay scene.flow_prompt
 * without clearing story approval or regressing project workflow.
 */
export async function updateSceneFlowPrompt(
  userId: string,
  projectId: string,
  sceneId: string,
  flowPrompt: string,
): Promise<GenerationSceneRecord> {
  const trimmed = flowPrompt.trim();
  if (!trimmed) {
    throw new Error('Scene prompt cannot be empty');
  }
  const store = await createStore();
  const snapshot = await store.getProjectSnapshot(userId, projectId);
  const scene = snapshot.scenes.find((item) => item.id === sceneId);
  if (!scene) {
    throw new Error('Scene not found');
  }

  const updated = await store.updateScene(userId, projectId, sceneId, {
    flowPrompt: trimmed,
    errorMessage: undefined,
  });

  const stories = await getStoryRepository();
  const story = await stories.getByProject(userId, projectId);
  const screenplay = story?.current_version?.screenplay;
  if (!screenplay) {
    throw new Error('Imported screenplay required to sync scene prompt');
  }

  const sceneIndex = screenplay.scenes.findIndex(
    (item) => item.scene_number === scene.sceneNumber,
  );
  if (sceneIndex < 0) {
    throw new Error(`Screenplay has no scene ${scene.sceneNumber} to sync`);
  }

  const nextScreenplay = {
    ...screenplay,
    scenes: screenplay.scenes.map((item, index) =>
      index === sceneIndex ? { ...item, flow_prompt: trimmed } : item,
    ),
  };

  await stories.patchCurrentScreenplayPreservingApproval(userId, projectId, nextScreenplay);
  await persistMemoryStudioNow();
  return updated;
}

export async function prepareScenesPromptReady(
  userId: string,
  projectId: string,
): Promise<GenerationSceneRecord[]> {
  const store = await createStore();
  const snapshot = await store.getProjectSnapshot(userId, projectId);
  const scenes =
    snapshot.scenes.length > 0
      ? snapshot.scenes
      : await store.ensureScenesFromScreenplay(userId, projectId, snapshot.screenplay);

  const updated: GenerationSceneRecord[] = [];
  for (const scene of scenes) {
    if (scene.state === 'PENDING') {
      updated.push(
        await store.updateScene(userId, projectId, scene.id, {
          state: 'PROMPT_READY',
          estimatedCreditCost: BUSINESS_DEFAULTS.estimatedCostPerScene,
        }),
      );
    } else {
      updated.push(scene);
    }
  }

  // Manual Flow package preparation must walk the legal project workflow path —
  // never jump SCENE_PREPARATION → GENERATING_SCENES directly.
  await advanceManualGenerationWorkflow(store, userId, projectId, snapshot.workflowState);

  await emitProjectEvent({
    userId,
    projectId,
    eventType: 'scene.package.ready',
    idempotencyParts: [projectId, 'package', snapshot.workflowState, updated.length],
    status: {
      scene_count: updated.length,
      prompt_ready_count: updated.filter(
        (scene) =>
          scene.state === 'PROMPT_READY' ||
          scene.state === 'AWAITING_MANUAL_GENERATION' ||
          scene.state === 'REAL_GENERATED' ||
          scene.state === 'READY_FOR_ASSEMBLY',
      ).length,
      flow_package_path: `/projects/${projectId}/flow-package`,
    },
  });

  return updated;
}

async function advanceManualGenerationWorkflow(
  store: AppGenerationStore,
  userId: string,
  projectId: string,
  from: WorkflowState,
): Promise<void> {
  if (
    from === 'GENERATING_SCENES' ||
    from === 'VERIFYING_SCENES' ||
    from === 'ASSEMBLY_READY' ||
    from === 'ASSEMBLING' ||
    from === 'QUALITY_CHECK' ||
    from === 'COMPLETED'
  ) {
    return;
  }

  const path = planTransitionPath(from, [
    'READY_FOR_GENERATION',
    'CREDIT_RESERVED',
    'GENERATING_SCENES',
  ]);
  for (const state of path) {
    await store.setProjectWorkflowState(userId, projectId, state);
  }
}

/** Legal hop after all five scenes verify: GENERATING_SCENES → VERIFYING_SCENES → ASSEMBLY_READY. */
async function advanceToManualAssemblyReady(
  store: AppGenerationStore,
  userId: string,
  projectId: string,
  from: WorkflowState,
): Promise<void> {
  if (from === 'ASSEMBLY_READY') {
    return;
  }

  if (from === 'GENERATING_SCENES' || from === 'VERIFYING_SCENES') {
    const path = planTransitionPath(from, ['VERIFYING_SCENES', 'ASSEMBLY_READY']);
    for (const state of path) {
      await store.setProjectWorkflowState(userId, projectId, state);
    }
    return;
  }

  // PAUSED / FAILED / NEEDS_HUMAN_INTERVENTION (and COMPLETED re-entry) may jump directly.
  const path = planTransitionPath(from, ['ASSEMBLY_READY']);
  for (const state of path) {
    await store.setProjectWorkflowState(userId, projectId, state);
  }
}

/**
 * Heal projects stuck after a prior illegal GENERATING_SCENES → ASSEMBLY_READY attempt:
 * if all five verified real assets are present, mark READY_FOR_ASSEMBLY and advance workflow.
 */
export async function ensureManualAssemblyReadyIfComplete(
  userId: string,
  projectId: string,
): Promise<GenerationSceneRecord[]> {
  const store = await createStore();
  const snapshot = await store.getProjectSnapshot(userId, projectId);
  const gate = evaluateAssemblyGate(snapshot.scenes);
  if (!(gate.ok && gate.mode === 'real')) {
    return snapshot.scenes;
  }

  for (const item of snapshot.scenes) {
    if (item.state === 'REAL_GENERATED') {
      await store.updateScene(userId, projectId, item.id, {
        state: 'READY_FOR_ASSEMBLY',
      });
    }
  }

  if (
    snapshot.workflowState !== 'ASSEMBLY_READY' &&
    snapshot.workflowState !== 'ASSEMBLING' &&
    snapshot.workflowState !== 'QUALITY_CHECK' &&
    snapshot.workflowState !== 'COMPLETED'
  ) {
    await advanceToManualAssemblyReady(store, userId, projectId, snapshot.workflowState);
  }

  await persistMemoryStudioNow();
  return (await store.getProjectSnapshot(userId, projectId)).scenes;
}

export async function importManualSceneVideo(input: {
  userId: string;
  projectId: string;
  sceneId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  confirmedCreditCost?: number | 'unknown';
  /** Explicit replacement of an already REAL_GENERATED scene asset. */
  allowReplace?: boolean;
}): Promise<ManualImportResult> {
  return withSceneImportLock(input.projectId, input.sceneId, () =>
    importManualSceneVideoLocked(input),
  );
}

async function importManualSceneVideoLocked(input: {
  userId: string;
  projectId: string;
  sceneId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  confirmedCreditCost?: number | 'unknown';
  allowReplace?: boolean;
}): Promise<ManualImportResult> {
  const store = await createStore();
  const snapshot = await store.getProjectSnapshot(input.userId, input.projectId);
  const scene = snapshot.scenes.find((item) => item.id === input.sceneId);
  if (!scene) {
    return { ok: false, reason: 'Scene not found' };
  }

  const contract = readMediaContractFromEnv(process.env, {
    minDurationSeconds: Math.max(1, scene.durationSeconds * 0.5),
    maxDurationSeconds: Math.max(
      scene.durationSeconds * 1.5,
      BUSINESS_DEFAULTS.defaultGenerationDurationSeconds + 4,
    ),
  });

  const sizeViolations = validateBytesAgainstContract(input.bytes.byteLength, contract);
  if (sizeViolations.length > 0) {
    const failed = await failVerification(store, input, scene, sizeViolations.map((v) => v.message).join('; '));
    return { ok: false, reason: failed.errorMessage ?? 'Upload rejected', scene: failed };
  }

  // Extension is a hint only — never proof of format.
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  // Idempotent success: same file already imported for this scene.
  const prior = await findCompletedImportBySha(input.projectId, input.sceneId, sha256);
  if (
    prior?.storageKey &&
    scene.assetChecksum === sha256 &&
    isRealAssemblyState(scene.state) &&
    scene.assetOrigin === 'REAL_GENERATED'
  ) {
    // Duplicate callbacks must not advance orchestration twice — same idempotency keys.
    await emitVerifiedSceneEvents({
      userId: input.userId,
      projectId: input.projectId,
      scene,
      storageKey: prior.storageKey,
      sha256,
      reused: true,
      assemblyReady: false,
    });
    return {
      ok: true,
      scene,
      storageKey: prior.storageKey,
      sha256,
      reused: true,
      crossProjectContentReuse: Boolean(await findCrossProjectDuplicate(sha256, input.projectId)),
      probe: {
        durationSeconds: scene.assetMetadata?.durationSeconds ?? 0,
        width: scene.assetMetadata?.width ?? null,
        height: scene.assetMetadata?.height ?? null,
        hasAudio: scene.assetMetadata?.hasAudio ?? false,
        videoCodec: scene.assetMetadata?.videoCodec ?? null,
      },
    };
  }

  if (isRealAssemblyState(scene.state) && scene.assetOrigin === 'REAL_GENERATED') {
    if (!input.allowReplace) {
      return {
        ok: false,
        reason:
          `Scene ${scene.sceneNumber} already has a verified REAL_GENERATED asset. ` +
          'Pass allowReplace=true for an explicit replacement (audit trail required).',
      };
    }
  }

  // Within-project duplicate assignment of same bytes to another scene.
  const duplicateScene = snapshot.scenes.find(
    (other) =>
      other.id !== scene.id &&
      other.assetChecksum === sha256 &&
      other.assetOrigin === 'REAL_GENERATED',
  );
  if (duplicateScene) {
    return {
      ok: false,
      reason: `Duplicate scene assignment rejected — same SHA-256 already on scene ${duplicateScene.sceneNumber}`,
    };
  }

  const cross = await findCrossProjectDuplicate(sha256, input.projectId);

  const operation = await createImportOperation({
    userId: input.userId,
    projectId: input.projectId,
    sceneId: scene.id,
    sceneNumber: scene.sceneNumber,
    sha256,
    byteLength: input.bytes.byteLength,
    allowReplace: input.allowReplace,
    previousStorageKey: scene.assetStorageKey,
  });

  const from =
    scene.state === 'PENDING' || scene.state === 'PROMPT_READY'
      ? 'AWAITING_MANUAL_GENERATION'
      : scene.state;
  if (scene.state === 'PENDING' || scene.state === 'PROMPT_READY') {
    await store.updateScene(input.userId, input.projectId, scene.id, {
      state: 'AWAITING_MANUAL_GENERATION',
    });
  }

  if (
    ![
      'AWAITING_MANUAL_GENERATION',
      'GENERATED_PENDING_UPLOAD',
      'VERIFICATION_FAILED',
      'UPLOADED_PENDING_VERIFICATION',
      'REAL_GENERATED',
      'READY_FOR_ASSEMBLY',
    ].includes(from)
  ) {
    await updateImportOperation(operation.id, {
      status: 'failed',
      errorMessage: `Illegal state ${scene.state}`,
    });
    return {
      ok: false,
      reason: `Scene ${scene.sceneNumber} cannot accept uploads in state ${scene.state}`,
    };
  }

  await store.updateScene(input.userId, input.projectId, scene.id, {
    state: 'UPLOADED_PENDING_VERIFICATION',
  });

  const tmpRoot = await mkdtemp(join(tmpdir(), 'asf-manual-import-'));
  const tmpPath = join(tmpRoot, `${scene.sceneNumber}.bin`);
  try {
    await writeFile(tmpPath, input.bytes);
    const paths = resolveMediaToolPaths(process.env);
    let probe;
    try {
      probe = await probeMedia(paths, tmpPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FFprobe failed';
      const failed = await failVerification(store, input, scene, message);
      await updateImportOperation(operation.id, { status: 'failed', errorMessage: message });
      return { ok: false, reason: message, scene: failed };
    }

    const probeResult = validateProbeAgainstContract(probe, contract);
    if (!probeResult.ok) {
      const message = probeResult.violations.map((v) => v.message).join('; ');
      const failed = await failVerification(store, input, scene, message);
      await updateImportOperation(operation.id, { status: 'failed', errorMessage: message });
      return { ok: false, reason: message, scene: failed };
    }

    const decode = await assertDecodableVideo(paths, tmpPath);
    if (!decode.ok) {
      const failed = await failVerification(store, input, scene, decode.reason);
      await updateImportOperation(operation.id, { status: 'failed', errorMessage: decode.reason });
      return { ok: false, reason: decode.reason, scene: failed };
    }

    await updateImportOperation(operation.id, { status: 'verified' });

    const preferredKey = `projects/${input.projectId}/scenes/${scene.sceneNumber}/original-${sha256.slice(0, 16)}.mp4`;
    const storage = getObjectStorage();
    const { entry, reusedExistingObject } = await registerOrReuseAsset({
      sha256,
      storageKey: preferredKey,
      byteLength: input.bytes.byteLength,
      contentType: 'video/mp4',
      userId: input.userId,
      projectId: input.projectId,
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
    });

    const storageKey = entry.storageKey;
    if (!reusedExistingObject) {
      await storage.putObject({
        key: storageKey,
        body: input.bytes,
        contentType: 'video/mp4',
        checksumSha256: sha256,
      });
    } else {
      const existingObj = await storage.getObject(storageKey);
      if (!existingObj || existingObj.body.byteLength === 0) {
        // Recovery: index pointed at missing object — restore immutable bytes at the indexed key.
        await storage.putObject({
          key: storageKey,
          body: input.bytes,
          contentType: 'video/mp4',
          checksumSha256: sha256,
        });
      }
    }

    await updateImportOperation(operation.id, { status: 'stored', storageKey });

    // Persist scene state only after durable object exists.
    const confirmed = input.confirmedCreditCost;
    const updated = await store.updateScene(input.userId, input.projectId, scene.id, {
      state: input.allowReplace && isRealAssemblyState(scene.state) ? 'REAL_GENERATED' : 'REAL_GENERATED',
      assetOrigin: 'REAL_GENERATED',
      assetStorageKey: storageKey,
      assetChecksum: sha256,
      assetMetadata: {
        bytes: input.bytes.byteLength,
        sha256,
        contentType: 'video/mp4',
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        hasVideo: true,
        hasAudio: probe.hasAudio,
        videoCodec: probe.videoCodec,
        audioCodec: probe.audioCodec,
        formatName: probe.formatName,
        aspectRatio: probeResult.aspectRatio,
        probedAt: new Date().toISOString(),
        originalDownloadPreserved: true,
        importOperationId: operation.id,
      },
      confirmedCreditCost: confirmed,
      estimatedCreditCost: BUSINESS_DEFAULTS.estimatedCostPerScene,
      errorMessage: undefined,
      creditReconciliationNote: input.allowReplace
        ? `Replaced prior asset ${scene.assetStorageKey ?? 'none'} via import ${operation.id}`
        : undefined,
    });

    await updateImportOperation(operation.id, {
      status: input.allowReplace ? 'replaced' : 'completed',
      storageKey,
    });

    const creditKey = `manual-import:${input.projectId}:${scene.id}:${sha256}:credits`;
    if (typeof confirmed === 'number') {
      await getCreditLedger().manualReconcile({
        userId: input.userId,
        projectId: input.projectId,
        amount: -Math.abs(confirmed),
        reason: `Manual Flow scene ${scene.sceneNumber} operator-reported spend (not auto-verified)`,
        idempotencyKey: `${creditKey}:confirm`,
      });
    } else if (confirmed === 'unknown') {
      await getCreditLedger().recordUnknownConsumption({
        userId: input.userId,
        projectId: input.projectId,
        amount: 'unknown',
        reason: `Manual Flow scene ${scene.sceneNumber} unknown credit consumption (not auto-verified)`,
        idempotencyKey: `${creditKey}:unknown`,
      });
    }

    await persistMemoryStudioNow();

    // Advance project workflow after the scene asset is durable. Failures here must not
    // roll a verified REAL_GENERATED scene back to VERIFICATION_FAILED.
    let assemblyReady = false;
    try {
      const refreshed = await store.getProjectSnapshot(input.userId, input.projectId);
      const gate = evaluateAssemblyGate(refreshed.scenes);
      if (gate.ok && gate.mode === 'real') {
        for (const item of refreshed.scenes) {
          if (item.state === 'REAL_GENERATED') {
            await store.updateScene(input.userId, input.projectId, item.id, {
              state: 'READY_FOR_ASSEMBLY',
            });
          }
        }
        await advanceToManualAssemblyReady(
          store,
          input.userId,
          input.projectId,
          refreshed.workflowState,
        );
        await persistMemoryStudioNow();
        assemblyReady = true;
      }
    } catch (workflowError) {
      const message =
        workflowError instanceof Error ? workflowError.message : 'Workflow advance failed';
      await emitVerifiedSceneEvents({
        userId: input.userId,
        projectId: input.projectId,
        scene: updated,
        storageKey,
        sha256,
        reused: reusedExistingObject || Boolean(prior),
        assemblyReady: false,
      });
      return {
        ok: false,
        reason: `Scene ${scene.sceneNumber} verified and stored, but project workflow did not reach ASSEMBLY_READY: ${message}`,
        scene: updated,
      };
    }

    await emitVerifiedSceneEvents({
      userId: input.userId,
      projectId: input.projectId,
      scene: updated,
      storageKey,
      sha256,
      reused: reusedExistingObject || Boolean(prior),
      assemblyReady,
    });

    return {
      ok: true,
      scene: updated,
      storageKey,
      sha256,
      reused: reusedExistingObject || Boolean(prior),
      crossProjectContentReuse: Boolean(cross),
      probe: {
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        hasAudio: probe.hasAudio,
        videoCodec: probe.videoCodec,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    const failed = await failVerification(store, input, scene, message);
    await updateImportOperation(operation.id, { status: 'failed', errorMessage: message }).catch(
      () => undefined,
    );
    return { ok: false, reason: message, scene: failed };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

async function failVerification(
  store: AppGenerationStore,
  input: { userId: string; projectId: string },
  scene: GenerationSceneRecord,
  reason: string,
): Promise<GenerationSceneRecord> {
  const failed = await store.updateScene(input.userId, input.projectId, scene.id, {
    state: 'VERIFICATION_FAILED',
    errorMessage: reason,
    // Never leave a broken asset marked REAL_GENERATED.
    ...(scene.state === 'REAL_GENERATED' || scene.state === 'READY_FOR_ASSEMBLY'
      ? {}
      : { assetOrigin: scene.assetOrigin }),
  });
  await emitProjectEvent({
    userId: input.userId,
    projectId: input.projectId,
    eventType: 'scene.verification.failed',
    sceneId: scene.id,
    idempotencyParts: [input.projectId, scene.id, 'verify-fail', reason.slice(0, 80)],
    status: {
      scene_number: scene.sceneNumber,
      scene_state: failed.state,
      reason,
    },
  });
  return failed;
}

async function emitVerifiedSceneEvents(input: {
  userId: string;
  projectId: string;
  scene: GenerationSceneRecord;
  storageKey: string;
  sha256: string;
  reused: boolean;
  assemblyReady: boolean;
}): Promise<void> {
  const common = {
    userId: input.userId,
    projectId: input.projectId,
    sceneId: input.scene.id,
    status: {
      scene_number: input.scene.sceneNumber,
      scene_state: input.scene.state,
      asset_origin: input.scene.assetOrigin ?? 'REAL_GENERATED',
      asset_storage_key: input.storageKey,
      asset_checksum_sha256: input.sha256,
      reused: input.reused,
      durable: true,
    } as Record<string, string | number | boolean | null>,
  };

  await emitProjectEvent({
    ...common,
    eventType: 'scene.uploaded',
    idempotencyParts: [input.projectId, input.scene.id, 'uploaded', input.sha256],
  });
  await emitProjectEvent({
    ...common,
    eventType: 'scene.verification.completed',
    idempotencyParts: [input.projectId, input.scene.id, 'verified', input.sha256],
  });
  await emitProjectEvent({
    ...common,
    eventType: 'scene.real_generated',
    idempotencyParts: [input.projectId, input.scene.id, 'real', input.sha256],
  });

  if (input.assemblyReady) {
    await emitProjectEvent({
      userId: input.userId,
      projectId: input.projectId,
      eventType: 'video.assembly.ready',
      idempotencyParts: [input.projectId, 'assembly-ready', input.sha256],
      status: { workflow_gate: 'ASSEMBLY_READY', provenance: 'REAL_GENERATED' },
    });
  }

  try {
    const videoId = await resolveVideoIdForProject(input.userId, input.projectId);
    const controller = getOrchestrationController();
    const store = await createStore();
    const snapshot = await store.getProjectSnapshot(input.userId, input.projectId);
    const verifiedSceneCount = snapshot.scenes.filter(
      (item) =>
        (item.state === 'REAL_GENERATED' || item.state === 'READY_FOR_ASSEMBLY') &&
        item.assetOrigin === 'REAL_GENERATED',
    ).length;
    await controller.patch(input.projectId, videoId, {
      verifiedSceneCount,
      status: input.assemblyReady ? 'completed' : 'running',
      lastSuccessfulSyncAt: new Date().toISOString(),
      currentSceneId: input.scene.id,
      currentSceneNumber: input.scene.sceneNumber,
    });
  } catch {
    // non-fatal
  }
}

async function createStore() {
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();
  return new AppGenerationStore(projects, stories, characters);
}
