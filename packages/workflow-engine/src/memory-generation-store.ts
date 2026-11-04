import { randomUUID } from 'node:crypto';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type {
  GenerationProjectSnapshot,
  GenerationSceneRecord,
  GenerationStore,
} from './generation-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

type ProjectMeta = {
  userId: string;
  workflowState: WorkflowState;
  screenplay: ScreenplayV1;
};

/**
 * Self-contained generation store for unit tests and local memory mode.
 */
export class MemoryGenerationStore implements GenerationStore {
  private readonly projects = new Map<string, ProjectMeta>();
  private readonly scenes = new Map<string, GenerationSceneRecord[]>();

  seed(input: {
    projectId: string;
    userId: string;
    workflowState: WorkflowState;
    screenplay: ScreenplayV1;
  }): void {
    this.projects.set(input.projectId, {
      userId: input.userId,
      workflowState: input.workflowState,
      screenplay: input.screenplay,
    });
  }

  async getProjectSnapshot(userId: string, projectId: string): Promise<GenerationProjectSnapshot> {
    const project = this.requireProject(userId, projectId);
    const scenes = this.scenes.get(projectId) ?? [];
    return {
      projectId,
      userId,
      workflowState: project.workflowState,
      screenplay: project.screenplay,
      scenes: structuredClone(scenes),
    };
  }

  async ensureScenesFromScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<GenerationSceneRecord[]> {
    this.requireProject(userId, projectId);
    const existing = this.scenes.get(projectId);
    if (existing && existing.length > 0) {
      return structuredClone(existing);
    }

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
    this.scenes.set(projectId, scenes);
    return structuredClone(scenes);
  }

  async updateScene(
    userId: string,
    projectId: string,
    sceneId: string,
    patch: Partial<GenerationSceneRecord>,
  ): Promise<GenerationSceneRecord> {
    this.requireProject(userId, projectId);
    const scenes = this.scenes.get(projectId) ?? [];
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
    this.scenes.set(projectId, scenes);
    return structuredClone(updated);
  }

  async setProjectWorkflowState(
    userId: string,
    projectId: string,
    state: WorkflowState,
  ): Promise<void> {
    const project = this.requireProject(userId, projectId);
    this.projects.set(projectId, { ...project, workflowState: state });
  }

  clear(): void {
    this.projects.clear();
    this.scenes.clear();
  }

  private requireProject(userId: string, projectId: string): ProjectMeta {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) {
      throw new Error('Project not found');
    }
    return project;
  }
}
