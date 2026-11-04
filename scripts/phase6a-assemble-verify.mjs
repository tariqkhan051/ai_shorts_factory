#!/usr/bin/env node
/**
 * Phase 6A end-to-end durable assembly verification (mock only).
 * Uses the same packages as the web app. Does not call Google Flow or spend credits.
 */
import { mkdir, readFile, access, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(root, 'apps', 'web');
process.chdir(webRoot);
process.env.PROJECT_STORE = process.env.PROJECT_STORE || 'memory';
process.env.STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
process.env.FLOW_PROVIDER = 'mock';

const require = createRequire(join(webRoot, 'package.json'));

async function main() {
  // Dynamic import compiled workspace packages via Next's node resolution from web.
  const { MemoryProjectRepository } = await import('@ai-shorts-factory/database');
  const { MemoryStoryRepository } = await import('@ai-shorts-factory/database');
  const { MemoryCharacterRepository } = await import('@ai-shorts-factory/database');
  const { createObjectStorage } = await import('@ai-shorts-factory/storage');
  const { MemoryCreditLedger } = await import('@ai-shorts-factory/credit-manager');
  const { MockVideoGenerationProvider } = await import('@ai-shorts-factory/flow-adapter');
  const {
    MemoryJobQueue,
    SequentialGenerationRunner,
  } = await import('@ai-shorts-factory/workflow-engine');
  const { createSampleScreenplay } = await import('@ai-shorts-factory/chatgpt-import');
  const { assembleProject } = await import('@ai-shorts-factory/media-engine');
  const { BUSINESS_DEFAULTS } = await import('@ai-shorts-factory/shared-types');
  const { mkdtemp, writeFile: wf, copyFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { createHash, randomUUID } = await import('node:crypto');

  const userId = '00000000-0000-4000-8000-000000000001';
  const projects = new MemoryProjectRepository();
  const stories = new MemoryStoryRepository(projects);
  const characters = new MemoryCharacterRepository(projects);
  const storage = createObjectStorage(process.env);
  const credits = new MemoryCreditLedger();
  const provider = new MockVideoGenerationProvider();
  const queue = new MemoryJobQueue();

  const project = await projects.create(userId, {
    name: 'Phase 6A Durable Assembly',
    category: 'cinematic',
    visual_style: 'realistic_cinematic',
    language: 'en',
    target_audience: 'testers',
    notes: '',
    input: {
      idea: 'Verify durable mock assembly',
      existing_story: '',
      additional_instructions: '',
      character_reference_notes: '',
    },
  });

  const sample = createSampleScreenplay({
    category: project.category,
    visual_style: project.visual_style,
    title: project.name,
  });
  await stories.importScreenplay(userId, project.id, sample);
  await stories.approveStory(userId, project.id);

  // Minimal generation store compatible with SequentialGenerationRunner
  const sceneMap = new Map();
  const genStore = {
    async getProjectSnapshot(_u, projectId) {
      const p = await projects.getById(userId, projectId);
      const s = await stories.getByProject(userId, projectId);
      return {
        projectId,
        userId,
        workflowState: p.workflow_state,
        screenplay: s.current_version.screenplay,
        scenes: structuredClone(sceneMap.get(projectId) ?? []),
      };
    },
    async ensureScenesFromScreenplay(_u, projectId, screenplay) {
      if (sceneMap.has(projectId)) return structuredClone(sceneMap.get(projectId));
      const now = new Date().toISOString();
      const scenes = screenplay.scenes.map((scene) => ({
        id: randomUUID(),
        projectId,
        sceneNumber: scene.scene_number,
        title: scene.title,
        state: 'PENDING',
        durationSeconds: scene.duration_seconds,
        flowPrompt: scene.flow_prompt,
        createdAt: now,
        updatedAt: now,
      }));
      sceneMap.set(projectId, scenes);
      return structuredClone(scenes);
    },
    async updateScene(_u, projectId, sceneId, patch) {
      const scenes = sceneMap.get(projectId);
      const idx = scenes.findIndex((s) => s.id === sceneId);
      const updated = { ...scenes[idx], ...patch, id: sceneId, projectId, updatedAt: new Date().toISOString() };
      scenes[idx] = updated;
      return structuredClone(updated);
    },
    async setProjectWorkflowState(_u, projectId, state) {
      await projects.setWorkflowState(userId, projectId, state);
    },
  };

  const runner = new SequentialGenerationRunner(genStore, credits, provider, storage);
  await queue.enqueue({
    projectId: project.id,
    userId,
    jobType: 'GENERATE_PROJECT_SCENES',
    idempotencyKey: `phase6a:generate:${project.id}`,
  });
  const job = await queue.claim('phase6a-worker', 300);
  const result = await runner.runProject(userId, project.id, { workerId: 'phase6a-worker' });
  if (result.failed) throw new Error(result.failed);
  await queue.complete(job.id, 'phase6a-worker');

  const snapshot = await genStore.getProjectSnapshot(userId, project.id);
  const completed = snapshot.scenes.filter((s) => s.state === 'COMPLETED');
  if (completed.length !== 5) throw new Error(`Expected 5 completed scenes, got ${completed.length}`);

  const temp = await mkdtemp(join(tmpdir(), 'asf-phase6a-'));
  try {
    const sceneInputs = [];
    for (const scene of completed.sort((a, b) => a.sceneNumber - b.sceneNumber)) {
      const local = join(temp, `scene-${scene.sceneNumber}.src`);
      const obj = await storage.getObject(scene.assetStorageKey);
      if (!obj) throw new Error(`Missing scene asset ${scene.assetStorageKey}`);
      await wf(local, obj.body);
      sceneInputs.push({
        sceneNumber: scene.sceneNumber,
        path: local,
        durationSeconds: scene.durationSeconds || 6,
      });
    }

    const outputPath = join(temp, 'final.mp4');
    const assembled = await assembleProject({
      scenes: sceneInputs,
      workDir: join(temp, 'work'),
      outputPath,
      allowSyntheticPlaceholders: true,
      maxSeconds: BUSINESS_DEFAULTS.finalVideoMaxSeconds,
      width: BUSINESS_DEFAULTS.finalVideoTargetWidth,
      height: BUSINESS_DEFAULTS.finalVideoTargetHeight,
      fps: BUSINESS_DEFAULTS.finalVideoFps,
    });

    const durableDir = join(webRoot, '.data', 'assemblies', project.id);
    await mkdir(durableDir, { recursive: true });
    const durableMp4 = join(durableDir, 'final.mp4');
    await copyFile(assembled.outputPath, durableMp4);
    await access(durableMp4);
    const bytes = await readFile(durableMp4);

    const record = {
      id: randomUUID(),
      projectId: project.id,
      userId,
      status: 'completed',
      storageKey: `users/${userId}/projects/${project.id}/final/final-${Date.now()}.mp4`,
      metadataStorageKey: null,
      localPath: durableMp4,
      fileSizeBytes: bytes.byteLength,
      durationSeconds: assembled.quality.durationSeconds,
      width: assembled.quality.width,
      height: assembled.quality.height,
      fps: assembled.quality.fps,
      videoCodec: 'h264',
      audioCodec: 'aac',
      usedSyntheticPlaceholders: assembled.usedSyntheticPlaceholders,
      upscaledFromLowerResolution: assembled.upscaledFromLowerResolution,
      sceneCount: 5,
      completedSceneCount: 5,
      notes: assembled.quality.notes,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    await writeFile(join(durableDir, 'record.json'), JSON.stringify(record, null, 2), 'utf8');
    await storage.putObject({
      key: record.storageKey,
      body: bytes,
      contentType: 'video/mp4',
    });

    // Persist memory studio so web UI can load the project after this script.
    const studio = {
      version: 1,
      savedAt: new Date().toISOString(),
      projects: projects.exportAll(),
      stories: stories.exportAll().stories,
      storyVersions: stories.exportAll().versions,
      characters: characters.exportAll().characters,
      characterLinks: characters.exportAll().projectLinks,
      scenesByProject: Object.fromEntries([...sceneMap.entries()]),
    };
    await projects.setWorkflowState(userId, project.id, 'COMPLETED');
    studio.projects = projects.exportAll();
    await mkdir(join(webRoot, '.data'), { recursive: true });
    await writeFile(join(webRoot, '.data', 'memory-studio.json'), JSON.stringify(studio, null, 2), 'utf8');

    console.log(
      JSON.stringify(
        {
          ok: true,
          projectId: project.id,
          mp4: durableMp4,
          record: join(durableDir, 'record.json'),
          size: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          durationSeconds: record.durationSeconds,
          synthetic: record.usedSyntheticPlaceholders,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
