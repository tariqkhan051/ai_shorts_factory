import { randomUUID } from 'node:crypto';
import type {
  CharacterRepository,
  ProjectRepository,
  StoryRepository,
} from '@ai-shorts-factory/database';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type {
  GenerationProjectSnapshot,
  GenerationSceneRecord,
  GenerationStore,
} from '@ai-shorts-factory/workflow-engine';

const globalForScenes = globalThis as typeof globalThis & {
  __asfScenes?: Map<string, GenerationSceneRecord[]>;
};

function sceneMap(): Map<string, GenerationSceneRecord[]> {
  if (!globalForScenes.__asfScenes) {
    globalForScenes.__asfScenes = new Map();
  }
  return globalForScenes.__asfScenes;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * App-layer GenerationStore bridging project/story repos + in-memory scene rows.
 * Scene rows are process-local in memory mode; Supabase scene persistence can replace
 * the map in a later hardening pass without changing the runner.
 */
export class AppGenerationStore implements GenerationStore {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly stories: StoryRepository,
    private readonly characters: CharacterRepository,
  ) {}

  async getProjectSnapshot(userId: string, projectId: string): Promise<GenerationProjectSnapshot> {
    const project = await this.projects.getById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    const story = await this.stories.getByProject(userId, projectId);
    const screenplay = story?.current_version?.screenplay;
    if (!screenplay) {
      throw new Error('Imported screenplay required before generation');
    }
    if (!story.approved_at) {
      throw new Error('Story must be approved before generation');
    }

    return {
      projectId,
      userId,
      workflowState: project.workflow_state,
      screenplay,
      scenes: structuredClone(sceneMap().get(projectId) ?? []),
    };
  }

  async ensureScenesFromScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<GenerationSceneRecord[]> {
    await this.getProjectSnapshot(userId, projectId);
    const existing = sceneMap().get(projectId);
    if (existing && existing.length > 0) {
      return structuredClone(existing);
    }

    // Optionally fold linked characters into continuity later; prompts already baked in screenplay.
    await this.characters.listByProject(userId, projectId);

    const timestamp = nowIso();
    const scenes = screenplay.scenes.map((scene) => {
      const record: GenerationSceneRecord = {
        id: randomUUID(),
        projectId,
        sceneNumber: scene.scene_number,
        title: scene.title,
        state: 'PENDING',
        durationSeconds: scene.duration_seconds,
        flowPrompt: scene.flow_prompt,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return record;
    });
    sceneMap().set(projectId, scenes);
    return structuredClone(scenes);
  }

  async updateScene(
    userId: string,
    projectId: string,
    sceneId: string,
    patch: Partial<GenerationSceneRecord>,
  ): Promise<GenerationSceneRecord> {
    await this.getProjectSnapshot(userId, projectId);
    const scenes = sceneMap().get(projectId) ?? [];
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    if (index < 0) {
      throw new Error('Scene not found');
    }
    const current = scenes[index]!;
    const updated: GenerationSceneRecord = {
      ...current,
      ...patch,
      id: current.id,
      projectId: current.projectId,
      updatedAt: nowIso(),
    };
    scenes[index] = updated;
    sceneMap().set(projectId, scenes);
    return structuredClone(updated);
  }

  async setProjectWorkflowState(
    userId: string,
    projectId: string,
    state: WorkflowState,
  ): Promise<void> {
    await this.projects.setWorkflowState(userId, projectId, state);
  }
}
