import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import type { CreateVideoPayload, UpdateVideoPayload } from '@ai-shorts-factory/validation';
import { assertTransition } from './workflow-transitions.js';
import type {
  VideoContextSnapshot,
  VideoRecord,
  VideoRepository,
} from './content-platform-types.js';
import { mapVideoRow } from './content-platform-mappers.js';
import type { ProjectRepository } from './types.js';

const APPROVED_OR_DONE = new Set(['COMPLETED', 'FINAL_APPROVAL', 'APPROVED']);

export class SupabaseVideoRepository implements VideoRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projects: ProjectRepository,
  ) {}

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) throw new Error('Project not found');
    return project;
  }

  async listByProject(userId: string, projectId: string): Promise<VideoRecord[]> {
    await this.requireProject(userId, projectId);
    const { data, error } = await this.client
      .from('videos')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list videos: ${error.message}`);
    return (data ?? []).map((row) => mapVideoRow(row));
  }

  async getById(userId: string, videoId: string): Promise<VideoRecord | null> {
    const { data, error } = await this.client
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Failed to load video: ${error.message}`);
    return data ? mapVideoRow(data) : null;
  }

  async getLegacyVideoForProject(
    userId: string,
    projectId: string,
  ): Promise<VideoRecord | null> {
    const project = await this.requireProject(userId, projectId);
    if (!project.legacy_single_video) return null;
    const videos = await this.listByProject(userId, projectId);
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0]!;
    return [...videos].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
  }

  async create(
    userId: string,
    projectId: string,
    input: CreateVideoPayload,
    inheritance: {
      project_dna_version: number;
      context_snapshot: VideoContextSnapshot;
      captions_on_video?: boolean;
      title?: string;
    },
  ): Promise<VideoRecord> {
    await this.requireProject(userId, projectId);
    const title =
      inheritance.title?.trim() ||
      input.title?.trim() ||
      input.concept.trim().slice(0, 80) ||
      'Untitled video';

    const { data, error } = await this.client
      .from('videos')
      .insert({
        project_id: projectId,
        user_id: userId,
        title,
        concept: input.concept,
        story_brief: input.story_brief ?? '',
        special_instructions: input.special_instructions ?? '',
        workflow_state: 'IDEA_SUBMITTED',
        captions_on_video: inheritance.captions_on_video ?? false,
        project_dna_version: inheritance.project_dna_version,
        context_snapshot: inheritance.context_snapshot,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to create video: ${error?.message ?? 'unknown'}`);

    const siblings = await this.listByProject(userId, projectId);
    if (siblings.length > 1 && this.projects.setLegacySingleVideo) {
      await this.projects.setLegacySingleVideo(userId, projectId, false);
    }

    return mapVideoRow(data);
  }

  async update(
    userId: string,
    videoId: string,
    input: UpdateVideoPayload,
  ): Promise<VideoRecord> {
    const existing = await this.getById(userId, videoId);
    if (!existing) throw new Error('Video not found');

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.concept !== undefined) patch.concept = input.concept;
    if (input.story_brief !== undefined) patch.story_brief = input.story_brief;
    if (input.special_instructions !== undefined) {
      patch.special_instructions = input.special_instructions;
    }
    if (input.captions_on_video !== undefined) patch.captions_on_video = input.captions_on_video;

    const { error } = await this.client
      .from('videos')
      .update(patch)
      .eq('id', videoId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update video: ${error.message}`);

    const updated = await this.getById(userId, videoId);
    if (!updated) throw new Error('Video disappeared after update');
    return updated;
  }

  async setWorkflowState(
    userId: string,
    videoId: string,
    state: WorkflowState,
  ): Promise<VideoRecord> {
    const existing = await this.getById(userId, videoId);
    if (!existing) throw new Error('Video not found');
    assertTransition(existing.workflow_state, state);

    const patch: Record<string, unknown> = { workflow_state: state };
    if (
      (state === 'APPROVED' || state === 'STORY_APPROVAL') &&
      !existing.approved_at
    ) {
      patch.approved_at = new Date().toISOString();
    }

    const { error } = await this.client
      .from('videos')
      .update(patch)
      .eq('id', videoId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update video workflow: ${error.message}`);

    const project = await this.projects.getById(userId, existing.project_id);
    if (project?.legacy_single_video) {
      await this.projects.setWorkflowState(userId, existing.project_id, state);
    }

    const updated = await this.getById(userId, videoId);
    if (!updated) throw new Error('Video disappeared after workflow update');
    return updated;
  }

  async refreshInheritedDna(
    userId: string,
    videoId: string,
    inheritance: {
      project_dna_version: number;
      context_snapshot: VideoContextSnapshot;
    },
  ): Promise<VideoRecord> {
    const existing = await this.getById(userId, videoId);
    if (!existing) throw new Error('Video not found');
    if (existing.approved_at || APPROVED_OR_DONE.has(existing.workflow_state)) {
      throw new Error('Cannot refresh DNA for approved or completed videos');
    }

    const { error } = await this.client
      .from('videos')
      .update({
        project_dna_version: inheritance.project_dna_version,
        context_snapshot: inheritance.context_snapshot,
      })
      .eq('id', videoId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to refresh video DNA: ${error.message}`);

    const updated = await this.getById(userId, videoId);
    if (!updated) throw new Error('Video disappeared after DNA refresh');
    return updated;
  }

  async softDelete(userId: string, videoId: string): Promise<void> {
    const { error } = await this.client
      .from('videos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', videoId)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw new Error(`Failed to delete video: ${error.message}`);
  }
}
