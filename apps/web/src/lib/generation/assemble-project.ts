import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleProject } from '@ai-shorts-factory/media-engine';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
} from '@/lib/projects/repository';
import { getObjectStorage } from '@/lib/storage';

export type AssembleProjectOutcome = {
  outputStorageKey: string;
  durationSeconds: number;
  width: number;
  height: number;
  usedSyntheticPlaceholders: boolean;
  upscaledFromLowerResolution: boolean;
  notes: string[];
};

/**
 * Assemble a finished project's five scenes into a ≤59s vertical MP4.
 * Uses FFmpeg via media-engine. Mock scene bytes become synthetic placeholders.
 */
export async function assembleProjectForUser(
  userId: string,
  projectId: string,
): Promise<AssembleProjectOutcome> {
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();
  const storage = getObjectStorage();
  const store = new AppGenerationStore(projects, stories, characters);

  const snapshot = await store.getProjectSnapshot(userId, projectId);
  if (
    snapshot.workflowState !== 'ASSEMBLY_READY' &&
    snapshot.workflowState !== 'PAUSED' &&
    snapshot.workflowState !== 'FAILED'
  ) {
    throw new Error(
      `Project must be ASSEMBLY_READY before assemble (now ${snapshot.workflowState})`,
    );
  }

  const scenes = snapshot.scenes.length
    ? snapshot.scenes
    : await store.ensureScenesFromScreenplay(userId, projectId, snapshot.screenplay);

  const completed = scenes.filter((scene) => scene.state === 'COMPLETED');
  if (completed.length !== BUSINESS_DEFAULTS.sceneCount) {
    throw new Error(
      `Need ${BUSINESS_DEFAULTS.sceneCount} completed scenes before assembly (have ${completed.length})`,
    );
  }

  if (snapshot.workflowState === 'FAILED' || snapshot.workflowState === 'PAUSED') {
    if (snapshot.workflowState === 'FAILED') {
      await projects.setWorkflowState(userId, projectId, 'ASSEMBLY_READY');
    }
    if (snapshot.workflowState === 'PAUSED') {
      await projects.setWorkflowState(userId, projectId, 'ASSEMBLY_READY');
    }
  }
  await projects.setWorkflowState(userId, projectId, 'ASSEMBLING');

  const root = await mkdtemp(join(tmpdir(), 'asf-web-assemble-'));
  try {
    const sceneInputs = [];
    for (const scene of completed.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      const localPath = join(root, `scene-${scene.sceneNumber}.src`);
      if (scene.assetStorageKey) {
        const object = await storage.getObject(scene.assetStorageKey);
        if (object) {
          await writeFile(localPath, object.body);
        } else {
          await writeFile(localPath, Buffer.from(`missing:${scene.assetStorageKey}`));
        }
      } else {
        await writeFile(localPath, Buffer.from(`empty-scene:${scene.sceneNumber}`));
      }
      sceneInputs.push({
        sceneNumber: scene.sceneNumber,
        path: localPath,
        durationSeconds:
          scene.durationSeconds || BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
      });
    }

    const outputPath = join(root, 'final.mp4');
    const assembled = await assembleProject({
      scenes: sceneInputs,
      workDir: join(root, 'work'),
      outputPath,
      allowSyntheticPlaceholders: true,
      maxSeconds: BUSINESS_DEFAULTS.finalVideoMaxSeconds,
      width: BUSINESS_DEFAULTS.finalVideoTargetWidth,
      height: BUSINESS_DEFAULTS.finalVideoTargetHeight,
      fps: BUSINESS_DEFAULTS.finalVideoFps,
    });

    await projects.setWorkflowState(userId, projectId, 'QUALITY_CHECK');

    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(assembled.outputPath);
    const outputStorageKey = `users/${userId}/projects/${projectId}/final/final-${Date.now()}.mp4`;
    await storage.putObject({
      key: outputStorageKey,
      body: bytes,
      contentType: 'video/mp4',
    });

    await projects.setWorkflowState(userId, projectId, 'COMPLETED');

    const quality = assembled.quality;
    if (!quality.ok) {
      throw new Error(quality.failures.join('; '));
    }

    return {
      outputStorageKey,
      durationSeconds: quality.durationSeconds,
      width: quality.width,
      height: quality.height,
      usedSyntheticPlaceholders: assembled.usedSyntheticPlaceholders,
      upscaledFromLowerResolution: assembled.upscaledFromLowerResolution,
      notes: quality.notes,
    };
  } catch (error) {
    try {
      await projects.setWorkflowState(userId, projectId, 'PAUSED');
    } catch {
      // ignore secondary transition errors
    }
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
