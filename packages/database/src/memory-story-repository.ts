import { randomUUID } from 'node:crypto';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import type { ProjectRepository } from './types.js';
import type {
  StoryRecord,
  StoryRepository,
  StoryVersionRecord,
  StoryWithCurrentVersion,
} from './story-types.js';
import { planTransitionPath } from './workflow-transitions.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryStoryRepository implements StoryRepository {
  private readonly storiesByProject = new Map<string, StoryRecord>();
  private readonly versions = new Map<string, StoryVersionRecord>();

  constructor(private readonly projects: ProjectRepository) {}

  async getByProject(userId: string, projectId: string): Promise<StoryWithCurrentVersion | null> {
    await this.requireProject(userId, projectId);
    const story = this.storiesByProject.get(projectId);
    if (!story) return null;
    const current_version = story.current_version_id
      ? (this.versions.get(story.current_version_id) ?? null)
      : null;
    return structuredClone({ ...story, current_version });
  }

  async markPromptReady(userId: string, projectId: string): Promise<WorkflowState> {
    const project = await this.requireProject(userId, projectId);
    const next =
      project.workflow_state === 'IDEA_SUBMITTED' ? 'STORY_PROMPT_READY' : project.workflow_state;
    const updated = await this.projects.setWorkflowState(userId, projectId, next);
    return updated.workflow_state;
  }

  async markWaitingForChatGpt(userId: string, projectId: string): Promise<WorkflowState> {
    const updated = await this.projects.setWorkflowState(userId, projectId, 'WAITING_FOR_CHATGPT');
    return updated.workflow_state;
  }

  async importScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion> {
    const project = await this.requireProject(userId, projectId);
    const saved = await this.saveVersion(userId, projectId, screenplay);
    await this.applyPath(userId, projectId, project.workflow_state, [
      'STORY_IMPORTED',
      'STORY_VALIDATION',
      'STORY_APPROVAL',
    ]);
    return saved;
  }

  async saveEditedScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion> {
    const project = await this.requireProject(userId, projectId);
    const saved = await this.saveVersion(userId, projectId, screenplay);
    if (project.workflow_state === 'SCENE_PREPARATION') {
      await this.projects.setWorkflowState(userId, projectId, 'STORY_APPROVAL');
    } else {
      await this.applyPath(userId, projectId, project.workflow_state, [
        'STORY_VALIDATION',
        'STORY_APPROVAL',
      ]);
    }
    return saved;
  }

  async patchCurrentScreenplayPreservingApproval(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion> {
    await this.requireProject(userId, projectId);
    const current = await this.getByProject(userId, projectId);
    if (!current?.current_version) {
      throw new Error('Cannot patch screenplay: no imported screenplay');
    }

    const timestamp = nowIso();
    const version: StoryVersionRecord = {
      id: randomUUID(),
      story_id: current.id,
      schema_version: screenplay.schema_version,
      screenplay,
      created_by: userId,
      created_at: timestamp,
    };
    this.versions.set(version.id, version);

    const nextStory: StoryRecord = {
      id: current.id,
      project_id: current.project_id,
      current_version_id: version.id,
      title: screenplay.title,
      approved_at: current.approved_at,
      characters_reviewed_at: current.characters_reviewed_at,
      created_at: current.created_at,
      updated_at: timestamp,
    };
    this.storiesByProject.set(projectId, nextStory);
    return structuredClone({ ...nextStory, current_version: version });
  }

  async approveStory(userId: string, projectId: string): Promise<StoryWithCurrentVersion> {
    const current = await this.getByProject(userId, projectId);
    if (!current?.current_version) {
      throw new Error('Cannot approve: no imported screenplay');
    }
    if (!current.characters_reviewed_at) {
      throw new Error('Cannot approve: mark characters as reviewed first');
    }
    const timestamp = nowIso();
    const approved: StoryRecord = {
      ...current,
      approved_at: timestamp,
      updated_at: timestamp,
    };
    this.storiesByProject.set(projectId, approved);
    await this.projects.setWorkflowState(userId, projectId, 'SCENE_PREPARATION');
    return structuredClone({
      ...approved,
      current_version: current.current_version,
    });
  }

  async markCharactersReviewed(
    userId: string,
    projectId: string,
  ): Promise<StoryWithCurrentVersion> {
    const current = await this.getByProject(userId, projectId);
    if (!current?.current_version) {
      throw new Error('Cannot mark characters reviewed: no imported screenplay');
    }
    const timestamp = nowIso();
    const next: StoryRecord = {
      ...current,
      characters_reviewed_at: timestamp,
      updated_at: timestamp,
    };
    this.storiesByProject.set(projectId, next);
    return structuredClone({
      ...next,
      current_version: current.current_version,
    });
  }

  clear(): void {
    this.storiesByProject.clear();
    this.versions.clear();
  }

  exportAll(): { stories: StoryRecord[]; versions: StoryVersionRecord[] } {
    return {
      stories: [...this.storiesByProject.values()].map((story) => structuredClone(story)),
      versions: [...this.versions.values()].map((version) => structuredClone(version)),
    };
  }

  importAll(input: { stories: StoryRecord[]; versions: StoryVersionRecord[] }): void {
    this.storiesByProject.clear();
    this.versions.clear();
    for (const version of input.versions) {
      this.versions.set(version.id, structuredClone(version));
    }
    for (const story of input.stories) {
      this.storiesByProject.set(story.project_id, {
        ...structuredClone(story),
        characters_reviewed_at: story.characters_reviewed_at ?? null,
      });
    }
  }

  private async applyPath(
    userId: string,
    projectId: string,
    from: WorkflowState,
    steps: WorkflowState[],
  ): Promise<void> {
    const path = planTransitionPath(from, steps);
    for (const state of path) {
      await this.projects.setWorkflowState(userId, projectId, state);
    }
  }

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }

  private async saveVersion(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<StoryWithCurrentVersion> {
    const timestamp = nowIso();
    let story = this.storiesByProject.get(projectId);
    if (!story) {
      story = {
        id: randomUUID(),
        project_id: projectId,
        current_version_id: null,
        title: screenplay.title,
        approved_at: null,
        characters_reviewed_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      };
    }

    const version: StoryVersionRecord = {
      id: randomUUID(),
      story_id: story.id,
      schema_version: screenplay.schema_version,
      screenplay,
      created_by: userId,
      created_at: timestamp,
    };
    this.versions.set(version.id, version);

    const nextStory: StoryRecord = {
      ...story,
      title: screenplay.title,
      current_version_id: version.id,
      approved_at: null,
      characters_reviewed_at: null,
      updated_at: timestamp,
    };
    this.storiesByProject.set(projectId, nextStory);
    return structuredClone({ ...nextStory, current_version: version });
  }
}
