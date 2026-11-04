import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleProject } from '@ai-shorts-factory/media-engine';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import {
  assemblyProjectDir,
  assemblyVideoPath,
} from '@/lib/assembly/file-assembly-store';
import { getAssemblyRecordStore } from '@/lib/assembly/runtime';
import { createAssemblyRecord, type AssemblyRecord } from '@/lib/assembly/types';
import { evaluateAssemblyGate } from '@/lib/generation/assembly-gate';
import { AppGenerationStore } from '@/lib/generation/app-generation-store';
import { getNotificationPublisher } from '@/lib/notifications/runtime';
import {
  getCharacterRepository,
  getProjectRepository,
  getStoryRepository,
  persistMemoryStudioNow,
} from '@/lib/projects/repository';
import { getObjectStorage } from '@/lib/storage';

export type AssembleProjectOutcome = {
  record: AssemblyRecord;
  outputStorageKey: string;
  localPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  usedSyntheticPlaceholders: boolean;
  upscaledFromLowerResolution: boolean;
  notes: string[];
  assemblyMode: 'real' | 'mock';
};

/**
 * Assemble a finished project's five scenes into a ≤59s vertical MP4.
 * Durable local path + structured record are confirmed before temp cleanup.
 */
export async function assembleProjectForUser(
  userId: string,
  projectId: string,
): Promise<AssembleProjectOutcome> {
  const projects = await getProjectRepository();
  const stories = await getStoryRepository();
  const characters = await getCharacterRepository();
  const storage = getObjectStorage();
  const assemblyStore = getAssemblyRecordStore();
  const store = new AppGenerationStore(projects, stories, characters);

  const project = await projects.getById(userId, projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const snapshot = await store.getProjectSnapshot(userId, projectId);
  if (
    snapshot.workflowState !== 'ASSEMBLY_READY' &&
    snapshot.workflowState !== 'PAUSED' &&
    snapshot.workflowState !== 'FAILED' &&
    snapshot.workflowState !== 'COMPLETED'
  ) {
    throw new Error(
      `Project must be ASSEMBLY_READY (or retryable) before assemble (now ${snapshot.workflowState})`,
    );
  }

  const scenes = snapshot.scenes.length
    ? snapshot.scenes
    : await store.ensureScenesFromScreenplay(userId, projectId, snapshot.screenplay);

  const gate = evaluateAssemblyGate(scenes);
  if (!gate.ok) {
    throw new Error(gate.message);
  }
  const completed = gate.scenes;
  const assemblyMode = gate.mode;
  const allowSyntheticPlaceholders = assemblyMode === 'mock';
  if (assemblyMode === 'real' && allowSyntheticPlaceholders) {
    throw new Error('Internal error: real assembly cannot enable synthetic placeholders');
  }

  const existing = await assemblyStore.getByProject(userId, projectId);
  await assemblyStore.save(
    createAssemblyRecord({
      id: existing?.id,
      createdAt: existing?.createdAt,
      projectId,
      userId,
      status: 'assembling',
      storageKey: existing?.storageKey ?? null,
      metadataStorageKey: existing?.metadataStorageKey ?? null,
      localPath: existing?.localPath ?? null,
      fileSizeBytes: existing?.fileSizeBytes ?? null,
      durationSeconds: existing?.durationSeconds ?? null,
      width: existing?.width ?? null,
      height: existing?.height ?? null,
      fps: existing?.fps ?? null,
      videoCodec: existing?.videoCodec ?? null,
      audioCodec: existing?.audioCodec ?? null,
      usedSyntheticPlaceholders: allowSyntheticPlaceholders,
      upscaledFromLowerResolution: true,
      sceneCount: BUSINESS_DEFAULTS.sceneCount,
      completedSceneCount: completed.length,
      notes: [
        ...(assemblyMode === 'mock'
          ? ['MOCK/SYNTHETIC assembly path — not real Google Flow media']
          : ['REAL assembly path — synthetic placeholders disabled']),
        ...(project.captions_on_video
          ? ['Captions enabled — burning screenplay text_overlay onto final MP4']
          : []),
      ],
      error: null,
      completedAt: null,
    }),
  );

  if (snapshot.workflowState === 'COMPLETED') {
    await projects.setWorkflowState(userId, projectId, 'ASSEMBLY_READY');
  } else if (snapshot.workflowState === 'FAILED' || snapshot.workflowState === 'PAUSED') {
    await projects.setWorkflowState(userId, projectId, 'ASSEMBLY_READY');
  }
  await projects.setWorkflowState(userId, projectId, 'ASSEMBLING');

  const root = await mkdtemp(join(tmpdir(), 'asf-web-assemble-'));
  try {
    const screenplayByNumber = new Map(
      snapshot.screenplay.scenes.map((scene) => [scene.scene_number, scene]),
    );
    const burnCaptions = Boolean(project.captions_on_video);
    const sceneInputs = [];
    for (const scene of completed.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      const localPath = join(root, `scene-${scene.sceneNumber}.src`);
      if (!scene.assetStorageKey) {
        throw new Error(`Scene ${scene.sceneNumber} has no assetStorageKey`);
      }
      const object = await storage.getObject(scene.assetStorageKey);
      if (!object || object.body.byteLength === 0) {
        throw new Error(
          `Scene ${scene.sceneNumber} asset missing or empty in storage (${scene.assetStorageKey})`,
        );
      }
      await writeFile(localPath, object.body);
      const screenplayScene = screenplayByNumber.get(scene.sceneNumber);
      sceneInputs.push({
        sceneNumber: scene.sceneNumber,
        path: localPath,
        durationSeconds:
          scene.durationSeconds || BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
        captionText: burnCaptions ? screenplayScene?.text_overlay?.trim() || '' : '',
      });
    }

    // Real path: refuse silent fallback to placeholders if any scene file is unreadable.
    if (assemblyMode === 'real') {
      for (const input of sceneInputs) {
        const scene = completed.find((item) => item.sceneNumber === input.sceneNumber);
        if (!scene?.assetStorageKey) {
          throw new Error(`Scene ${input.sceneNumber} missing durable asset during real assembly`);
        }
      }
    }

    const outputPath = join(root, 'final.mp4');
    const assembled = await assembleProject({
      scenes: sceneInputs,
      workDir: join(root, 'work'),
      outputPath,
      allowSyntheticPlaceholders,
      burnCaptions,
      maxSeconds: BUSINESS_DEFAULTS.finalVideoMaxSeconds,
      width: BUSINESS_DEFAULTS.finalVideoTargetWidth,
      height: BUSINESS_DEFAULTS.finalVideoTargetHeight,
      fps: BUSINESS_DEFAULTS.finalVideoFps,
    });

    if (assemblyMode === 'real' && assembled.usedSyntheticPlaceholders) {
      throw new Error(
        'Real assembly produced synthetic placeholders — refusing to publish. Check scene assets.',
      );
    }

    await projects.setWorkflowState(userId, projectId, 'QUALITY_CHECK');

    const bytes = await readFile(assembled.outputPath);
    if (bytes.byteLength === 0) {
      throw new Error('Assembled MP4 is empty');
    }

    const quality = assembled.quality;
    if (!quality.ok) {
      throw new Error(quality.failures.join('; '));
    }

    // Durable local copy first — never delete temp until this exists.
    const durableDir = assemblyProjectDir(projectId);
    await mkdir(durableDir, { recursive: true });
    const localPath = assemblyVideoPath(projectId);
    await copyFile(assembled.outputPath, localPath);
    await access(localPath);

    const stamp = Date.now();
    const outputStorageKey = `users/${userId}/projects/${projectId}/final/final-${stamp}.mp4`;
    const metadataStorageKey = `users/${userId}/projects/${projectId}/final/final-${stamp}.meta.json`;

    await storage.putObject({
      key: outputStorageKey,
      body: bytes,
      contentType: 'video/mp4',
    });

    const record = await assemblyStore.save(
      createAssemblyRecord({
        id: existing?.id,
        createdAt: existing?.createdAt,
        projectId,
        userId,
        status: 'completed',
        storageKey: outputStorageKey,
        metadataStorageKey,
        localPath,
        fileSizeBytes: bytes.byteLength,
        durationSeconds: quality.durationSeconds,
        width: quality.width,
        height: quality.height,
        fps: quality.fps,
        videoCodec: 'h264',
        audioCodec: 'aac',
        usedSyntheticPlaceholders: assembled.usedSyntheticPlaceholders,
        upscaledFromLowerResolution: assembled.upscaledFromLowerResolution,
        sceneCount: BUSINESS_DEFAULTS.sceneCount,
        completedSceneCount: completed.length,
        notes: [
          ...(assemblyMode === 'mock'
            ? ['MOCK/SYNTHETIC output — not real AI-generated Flow video']
            : ['REAL Flow import assembly']),
          ...(assembled.burnedCaptions
            ? ['Burned on-screen captions from screenplay text_overlay']
            : project.captions_on_video
              ? ['Captions enabled but no non-empty text_overlay cues were available']
              : []),
          ...quality.notes,
        ],
        error: null,
      }),
    );

    // Sibling durable metadata next to final.mp4 (authoritative copy also in record.json + object store).
    const metaJson = JSON.stringify(record, null, 2);
    await writeFile(join(durableDir, 'final.meta.json'), metaJson, 'utf8');

    await storage.putObject({
      key: metadataStorageKey,
      body: Buffer.from(metaJson, 'utf8'),
      contentType: 'application/json',
    });

    await projects.setWorkflowState(userId, projectId, 'COMPLETED');
    await persistMemoryStudioNow();

    const publisher = await getNotificationPublisher();
    publisher.publishProjectUpdated(userId, projectId);
    await publisher.publish({
      userId,
      projectId,
      type: 'assembly_completed',
      title: 'Final video assembled',
      body: assembled.usedSyntheticPlaceholders
        ? `MOCK/SYNTHETIC ${quality.width}×${quality.height}, ${quality.durationSeconds.toFixed(1)}s — not real AI video.`
        : `Output ${quality.width}×${quality.height}, ${quality.durationSeconds.toFixed(1)}s (max 59s).`,
      href: `/projects/${projectId}/assemble`,
    });

    return {
      record,
      outputStorageKey,
      localPath,
      durationSeconds: quality.durationSeconds,
      width: quality.width,
      height: quality.height,
      usedSyntheticPlaceholders: assembled.usedSyntheticPlaceholders,
      upscaledFromLowerResolution: assembled.upscaledFromLowerResolution,
      notes: quality.notes,
      assemblyMode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FFmpeg assembly failed';
    try {
      await assemblyStore.markFailed(userId, projectId, message);
    } catch {
      // ignore secondary persistence errors
    }
    try {
      await projects.setWorkflowState(userId, projectId, 'PAUSED');
      await persistMemoryStudioNow();
    } catch {
      // ignore secondary transition errors
    }
    try {
      const publisher = await getNotificationPublisher();
      publisher.publishProjectUpdated(userId, projectId);
      await publisher.publish({
        userId,
        projectId,
        type: 'assembly_failed',
        title: 'Assembly failed',
        body: message,
        href: `/projects/${projectId}/assemble`,
      });
    } catch {
      // notification failures must not mask assembly errors
    }
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
