import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import type { ProjectRepository } from './types.js';
import type {
  StoryRepository,
  StoryVersionRecord,
  StoryWithCurrentVersion,
} from './story-types.js';
import { planTransitionPath } from './workflow-transitions.js';

function mapStory(
  story: Record<string, unknown>,
  current_version: StoryVersionRecord | null,
): StoryWithCurrentVersion {
  return {
    id: String(story.id),
    project_id: String(story.project_id),
    current_version_id: (story.current_version_id as string | null) ?? null,
    title: String(story.title),
    approved_at: (story.approved_at as string | null) ?? null,
    characters_reviewed_at: (story.characters_reviewed_at as string | null) ?? null,
    created_at: String(story.created_at),
    updated_at: String(story.updated_at),
    current_version,
  };
}

export class SupabaseStoryRepository implements StoryRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projects: ProjectRepository,
  ) {}

  async getByProject(userId: string, projectId: string): Promise<StoryWithCurrentVersion | null> {
    await this.requireProject(userId, projectId);
    const { data: story, error } = await this.client
      .from('stories')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load story: ${error.message}`);
    }
    if (!story) return null;

    let current_version: StoryVersionRecord | null = null;
    if (story.current_version_id) {
      const { data: version, error: versionError } = await this.client
        .from('story_versions')
        .select('*')
        .eq('id', story.current_version_id)
        .maybeSingle();
      if (versionError) {
        throw new Error(`Failed to load story version: ${versionError.message}`);
      }
      if (version) {
        current_version = {
          id: version.id,
          story_id: version.story_id,
          schema_version: version.schema_version,
          screenplay: version.screenplay as ScreenplayV1,
          created_by: version.created_by,
          created_at: version.created_at,
        };
      }
    }

    return mapStory(story, current_version);
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

    const { data: version, error: versionError } = await this.client
      .from('story_versions')
      .insert({
        story_id: current.id,
        schema_version: screenplay.schema_version,
        screenplay,
        created_by: userId,
      })
      .select('*')
      .single();

    if (versionError || !version) {
      throw new Error(`Failed to save story version: ${versionError?.message ?? 'unknown error'}`);
    }

    const { error: updateError } = await this.client
      .from('stories')
      .update({
        title: screenplay.title,
        current_version_id: version.id,
      })
      .eq('id', current.id);

    if (updateError) {
      throw new Error(`Failed to point story at patched version: ${updateError.message}`);
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: projectId,
      action: 'story.prompt_patched',
      entity_type: 'story',
      entity_id: current.id,
      metadata: { version_id: version.id, preserve_approval: true },
    });

    return {
      id: current.id,
      project_id: projectId,
      current_version_id: version.id,
      title: screenplay.title,
      approved_at: current.approved_at,
      characters_reviewed_at: current.characters_reviewed_at,
      created_at: current.created_at,
      updated_at: new Date().toISOString(),
      current_version: {
        id: version.id,
        story_id: current.id,
        schema_version: version.schema_version,
        screenplay: version.screenplay as ScreenplayV1,
        created_by: version.created_by,
        created_at: version.created_at,
      },
    };
  }

  async approveStory(userId: string, projectId: string): Promise<StoryWithCurrentVersion> {
    const current = await this.getByProject(userId, projectId);
    if (!current?.current_version) {
      throw new Error('Cannot approve: no imported screenplay');
    }
    if (!current.characters_reviewed_at) {
      throw new Error('Cannot approve: mark characters as reviewed first');
    }

    const { error } = await this.client
      .from('stories')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', current.id);
    if (error) {
      throw new Error(`Failed to approve story: ${error.message}`);
    }

    await this.projects.setWorkflowState(userId, projectId, 'SCENE_PREPARATION');
    const refreshed = await this.getByProject(userId, projectId);
    if (!refreshed) {
      throw new Error('Story missing after approval');
    }
    return refreshed;
  }

  async markCharactersReviewed(
    userId: string,
    projectId: string,
  ): Promise<StoryWithCurrentVersion> {
    const current = await this.getByProject(userId, projectId);
    if (!current?.current_version) {
      throw new Error('Cannot mark characters reviewed: no imported screenplay');
    }
    const { error } = await this.client
      .from('stories')
      .update({ characters_reviewed_at: new Date().toISOString() })
      .eq('id', current.id);
    if (error) {
      throw new Error(`Failed to mark characters reviewed: ${error.message}`);
    }
    const refreshed = await this.getByProject(userId, projectId);
    if (!refreshed) {
      throw new Error('Story missing after character review');
    }
    return refreshed;
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
    let story = await this.getByProject(userId, projectId);
    if (!story) {
      const { data, error } = await this.client
        .from('stories')
        .insert({
          project_id: projectId,
          title: screenplay.title,
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new Error(`Failed to create story: ${error?.message ?? 'unknown error'}`);
      }
      story = mapStory(data, null);
    }

    const { data: version, error: versionError } = await this.client
      .from('story_versions')
      .insert({
        story_id: story.id,
        schema_version: screenplay.schema_version,
        screenplay,
        created_by: userId,
      })
      .select('*')
      .single();

    if (versionError || !version) {
      throw new Error(`Failed to save story version: ${versionError?.message ?? 'unknown error'}`);
    }

    const { error: updateError } = await this.client
      .from('stories')
      .update({
        title: screenplay.title,
        current_version_id: version.id,
        approved_at: null,
        characters_reviewed_at: null,
      })
      .eq('id', story.id);

    if (updateError) {
      throw new Error(`Failed to point story at new version: ${updateError.message}`);
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: projectId,
      action: 'story.version_saved',
      entity_type: 'story',
      entity_id: story.id,
      metadata: { version_id: version.id, title: screenplay.title },
    });

    return {
      id: story.id,
      project_id: projectId,
      current_version_id: version.id,
      title: screenplay.title,
      approved_at: null,
      characters_reviewed_at: null,
      created_at: story.created_at,
      updated_at: new Date().toISOString(),
      current_version: {
        id: version.id,
        story_id: story.id,
        schema_version: version.schema_version,
        screenplay: version.screenplay as ScreenplayV1,
        created_by: version.created_by,
        created_at: version.created_at,
      },
    };
  }
}
