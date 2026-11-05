import { randomUUID } from 'node:crypto';
import type { GameServerEnvironment, WorkflowState } from '@ai-shorts-factory/shared-types';
import { assertTransition } from './workflow-transitions.js';
import type {
  CreateProjectInput,
  DashboardStats,
  ProjectInputRecord,
  ProjectRecord,
  ProjectRepository,
  UpdateProjectInput,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory project store for unit tests and local development without Supabase.
 * Not for production.
 */
export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectRecord>();

  async listByUser(userId: string): Promise<ProjectRecord[]> {
    return [...this.projects.values()]
      .filter((p) => p.user_id === userId && p.deleted_at === null)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getById(userId: string, projectId: string): Promise<ProjectRecord | null> {
    const project = this.projects.get(projectId);
    if (!project || project.user_id !== userId || project.deleted_at) {
      return null;
    }
    return structuredClone(project);
  }

  async create(userId: string, input: CreateProjectInput): Promise<ProjectRecord> {
    const timestamp = nowIso();
    const projectId = randomUUID();
    const brief = input.input;
    const projectInput: ProjectInputRecord | null = brief
      ? {
          id: randomUUID(),
          project_id: projectId,
          idea: brief.idea,
          existing_story: brief.existing_story ?? '',
          additional_instructions: brief.additional_instructions ?? '',
          character_reference_notes: brief.character_reference_notes ?? '',
          created_at: timestamp,
          updated_at: timestamp,
        }
      : input.initial_video_concept
        ? {
            id: randomUUID(),
            project_id: projectId,
            idea: input.initial_video_concept,
            existing_story: '',
            additional_instructions: '',
            character_reference_notes: '',
            created_at: timestamp,
            updated_at: timestamp,
          }
        : null;

    const project: ProjectRecord = {
      id: projectId,
      user_id: userId,
      name: input.name,
      category: input.category,
      visual_style: input.visual_style ?? 'automatic',
      language: input.language ?? 'en',
      target_audience: input.target_audience ?? '',
      workflow_state: 'IDEA_SUBMITTED',
      notes: input.notes ?? '',
      captions_on_video: input.captions_on_video ?? false,
      brand_id: input.brand_id ?? null,
      niche: input.niche ?? '',
      content_purpose: input.content_purpose ?? '',
      universe_context: input.universe_context ?? '',
      dna_current_version: 0,
      legacy_single_video: Boolean(projectInput),
      game_profile_id: null,
      game_server_environment: null,
      active_game_patch_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
      input: projectInput,
    };

    this.projects.set(projectId, project);
    return structuredClone(project);
  }

  async update(
    userId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) {
      throw new Error('Project not found');
    }

    const timestamp = nowIso();
    const nextInput = existing.input
      ? {
          ...existing.input,
          idea: input.input?.idea ?? existing.input.idea,
          existing_story: input.input?.existing_story ?? existing.input.existing_story,
          additional_instructions:
            input.input?.additional_instructions ?? existing.input.additional_instructions,
          character_reference_notes:
            input.input?.character_reference_notes ?? existing.input.character_reference_notes,
          updated_at: timestamp,
        }
      : null;

    const updated: ProjectRecord = {
      ...existing,
      name: input.name ?? existing.name,
      category: input.category ?? existing.category,
      visual_style: input.visual_style ?? existing.visual_style,
      language: input.language ?? existing.language,
      target_audience: input.target_audience ?? existing.target_audience,
      notes: input.notes ?? existing.notes,
      captions_on_video: input.captions_on_video ?? existing.captions_on_video,
      brand_id: input.brand_id !== undefined ? input.brand_id : existing.brand_id,
      niche: input.niche ?? existing.niche,
      content_purpose: input.content_purpose ?? existing.content_purpose,
      universe_context: input.universe_context ?? existing.universe_context,
      updated_at: timestamp,
      input: nextInput,
    };

    this.projects.set(projectId, updated);
    return structuredClone(updated);
  }

  async softDelete(userId: string, projectId: string): Promise<void> {
    const existing = await this.getById(userId, projectId);
    if (!existing) {
      throw new Error('Project not found');
    }
    this.projects.set(projectId, {
      ...existing,
      deleted_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  async getDashboardStats(userId: string): Promise<DashboardStats> {
    const projects = await this.listByUser(userId);
    const terminalCompleted = new Set(['COMPLETED', 'FINAL_APPROVAL', 'APPROVED']);
    const failed = new Set(['FAILED', 'CANCELLED']);
    const intervention = new Set(['NEEDS_HUMAN_INTERVENTION', 'PAUSED']);

    return {
      projectsInProgress: projects.filter(
        (p) =>
          !terminalCompleted.has(p.workflow_state) &&
          !failed.has(p.workflow_state) &&
          !intervention.has(p.workflow_state),
      ).length,
      completedVideos: projects.filter((p) => terminalCompleted.has(p.workflow_state)).length,
      failedJobs: projects.filter((p) => failed.has(p.workflow_state)).length,
      needsIntervention: projects.filter((p) => intervention.has(p.workflow_state)).length,
    };
  }

  async setWorkflowState(
    userId: string,
    projectId: string,
    state: WorkflowState,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) {
      throw new Error('Project not found');
    }
    assertTransition(existing.workflow_state, state);
    const updated: ProjectRecord = {
      ...existing,
      workflow_state: state,
      updated_at: nowIso(),
    };
    this.projects.set(projectId, updated);
    return structuredClone(updated);
  }

  /** Internal: advance DNA version pointer after publish/seed. */
  async setDnaVersion(userId: string, projectId: string, version: number): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const updated: ProjectRecord = {
      ...existing,
      dna_current_version: version,
      updated_at: nowIso(),
    };
    this.projects.set(projectId, updated);
    return structuredClone(updated);
  }

  async setLegacySingleVideo(
    userId: string,
    projectId: string,
    value: boolean,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const updated: ProjectRecord = {
      ...existing,
      legacy_single_video: value,
      updated_at: nowIso(),
    };
    this.projects.set(projectId, updated);
    return structuredClone(updated);
  }

  async assignBrand(
    userId: string,
    projectId: string,
    brandId: string,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const updated: ProjectRecord = {
      ...existing,
      brand_id: brandId,
      updated_at: nowIso(),
    };
    this.projects.set(projectId, updated);
    return structuredClone(updated);
  }

  async setGameKnowledgeBinding(
    userId: string,
    projectId: string,
    binding: {
      game_profile_id: string | null;
      game_server_environment: GameServerEnvironment | null;
      active_game_patch_id: string | null;
    },
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const updated: ProjectRecord = {
      ...existing,
      game_profile_id: binding.game_profile_id,
      game_server_environment: binding.game_server_environment,
      active_game_patch_id: binding.active_game_patch_id,
      updated_at: nowIso(),
    };
    this.projects.set(projectId, updated);
    return structuredClone(updated);
  }

  /** Test helper */
  clear(): void {
    this.projects.clear();
  }

  /** Snapshot helpers for local durable memory-mode restarts. */
  exportAll(): ProjectRecord[] {
    return [...this.projects.values()].map((project) => structuredClone(project));
  }

  importAll(records: ProjectRecord[]): void {
    this.projects.clear();
    for (const record of records) {
      this.projects.set(
        record.id,
        structuredClone({
          ...record,
          captions_on_video: record.captions_on_video ?? false,
          brand_id: record.brand_id ?? null,
          niche: record.niche ?? '',
          content_purpose: record.content_purpose ?? '',
          universe_context: record.universe_context ?? '',
          dna_current_version: record.dna_current_version ?? 0,
          legacy_single_video: record.legacy_single_video ?? Boolean(record.input),
          game_profile_id: record.game_profile_id ?? null,
          game_server_environment: record.game_server_environment ?? null,
          active_game_patch_id: record.active_game_patch_id ?? null,
        }),
      );
    }
  }
}
