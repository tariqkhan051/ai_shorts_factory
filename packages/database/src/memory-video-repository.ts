import { randomUUID } from 'node:crypto';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import type { CreateVideoPayload, UpdateVideoPayload } from '@ai-shorts-factory/validation';
import { assertTransition } from './workflow-transitions.js';
import type {
  VideoContextSnapshot,
  VideoRecord,
  VideoRepository,
} from './content-platform-types.js';
import type { MemoryProjectRepository } from './memory-project-repository.js';

function nowIso(): string {
  return new Date().toISOString();
}

const APPROVED_OR_DONE = new Set([
  'COMPLETED',
  'FINAL_APPROVAL',
  'APPROVED',
]);

export class MemoryVideoRepository implements VideoRepository {
  private readonly videos = new Map<string, VideoRecord>();

  constructor(private readonly projects: MemoryProjectRepository) {}

  private assertProjectOwned(userId: string, projectId: string): void {
    const project = this.projects.exportAll().find((p) => p.id === projectId);
    if (!project || project.user_id !== userId || project.deleted_at) {
      throw new Error('Project not found');
    }
  }

  async listByProject(userId: string, projectId: string): Promise<VideoRecord[]> {
    this.assertProjectOwned(userId, projectId);
    return [...this.videos.values()]
      .filter((v) => v.project_id === projectId && v.user_id === userId && !v.deleted_at)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((v) => structuredClone(v));
  }

  async getById(userId: string, videoId: string): Promise<VideoRecord | null> {
    const video = this.videos.get(videoId);
    if (!video || video.user_id !== userId || video.deleted_at) return null;
    return structuredClone(video);
  }

  async getLegacyVideoForProject(
    userId: string,
    projectId: string,
  ): Promise<VideoRecord | null> {
    const project = await this.projects.getById(userId, projectId);
    if (!project?.legacy_single_video) return null;
    const videos = await this.listByProject(userId, projectId);
    return videos.length === 1 ? videos[0]! : videos.sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
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
    this.assertProjectOwned(userId, projectId);
    const timestamp = nowIso();
    const title =
      inheritance.title?.trim() ||
      input.title?.trim() ||
      input.concept.trim().slice(0, 80) ||
      'Untitled video';

    const video: VideoRecord = {
      id: randomUUID(),
      project_id: projectId,
      user_id: userId,
      title,
      concept: input.concept,
      story_brief: input.story_brief ?? '',
      special_instructions: input.special_instructions ?? '',
      workflow_state: 'IDEA_SUBMITTED',
      captions_on_video: inheritance.captions_on_video ?? false,
      project_dna_version: inheritance.project_dna_version,
      context_snapshot: structuredClone(inheritance.context_snapshot),
      approved_at: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    this.videos.set(video.id, video);

    // Adding a second video clears the legacy single-video shim flag.
    const siblings = await this.listByProject(userId, projectId);
    if (siblings.length > 1) {
      await this.projects.setLegacySingleVideo(userId, projectId, false);
    }

    return structuredClone(video);
  }

  async update(
    userId: string,
    videoId: string,
    input: UpdateVideoPayload,
  ): Promise<VideoRecord> {
    const existing = await this.getById(userId, videoId);
    if (!existing) throw new Error('Video not found');
    const updated: VideoRecord = {
      ...existing,
      title: input.title ?? existing.title,
      concept: input.concept ?? existing.concept,
      story_brief: input.story_brief ?? existing.story_brief,
      special_instructions: input.special_instructions ?? existing.special_instructions,
      captions_on_video: input.captions_on_video ?? existing.captions_on_video,
      updated_at: nowIso(),
    };
    this.videos.set(videoId, updated);
    return structuredClone(updated);
  }

  async setWorkflowState(
    userId: string,
    videoId: string,
    state: WorkflowState,
  ): Promise<VideoRecord> {
    const existing = await this.getById(userId, videoId);
    if (!existing) throw new Error('Video not found');
    assertTransition(existing.workflow_state, state);
    const updated: VideoRecord = {
      ...existing,
      workflow_state: state,
      approved_at:
        state === 'APPROVED' || state === 'STORY_APPROVAL'
          ? existing.approved_at ?? nowIso()
          : existing.approved_at,
      updated_at: nowIso(),
    };
    this.videos.set(videoId, updated);

    // Keep project.workflow_state in sync for legacy dashboards when single-video.
    const project = await this.projects.getById(userId, existing.project_id);
    if (project?.legacy_single_video) {
      await this.projects.setWorkflowState(userId, existing.project_id, state);
    }

    return structuredClone(updated);
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
    const updated: VideoRecord = {
      ...existing,
      project_dna_version: inheritance.project_dna_version,
      context_snapshot: structuredClone(inheritance.context_snapshot),
      updated_at: nowIso(),
    };
    this.videos.set(videoId, updated);
    return structuredClone(updated);
  }

  async softDelete(userId: string, videoId: string): Promise<void> {
    const existing = await this.getById(userId, videoId);
    if (!existing) throw new Error('Video not found');
    this.videos.set(videoId, {
      ...existing,
      deleted_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  clear(): void {
    this.videos.clear();
  }

  exportAll(): VideoRecord[] {
    return [...this.videos.values()].map((v) => structuredClone(v));
  }

  importAll(records: VideoRecord[]): void {
    this.videos.clear();
    for (const record of records) {
      this.videos.set(record.id, structuredClone(record));
    }
  }
}
