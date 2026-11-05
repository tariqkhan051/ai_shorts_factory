import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowState } from '@ai-shorts-factory/shared-types';
import { assertTransition } from './workflow-transitions.js';
import type {
  CreateProjectInput,
  DashboardStats,
  ProjectInputRecord,
  ProjectRecord,
  ProjectRepository,
  UpdateProjectInput,
} from './types.js';

type ProjectRow = Omit<ProjectRecord, 'input'> & {
  project_inputs: ProjectInputRecord | ProjectInputRecord[] | null;
};

function normalizeInput(
  value: ProjectInputRecord | ProjectInputRecord[] | null,
): ProjectInputRecord | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    category: row.category,
    visual_style: row.visual_style,
    language: row.language,
    target_audience: row.target_audience,
    workflow_state: row.workflow_state,
    notes: row.notes,
    captions_on_video: Boolean(row.captions_on_video),
    brand_id: row.brand_id ?? null,
    niche: row.niche ?? '',
    content_purpose: row.content_purpose ?? '',
    universe_context: row.universe_context ?? '',
    dna_current_version: row.dna_current_version ?? 0,
    legacy_single_video: row.legacy_single_video ?? Boolean(normalizeInput(row.project_inputs)),
    game_profile_id: row.game_profile_id ?? null,
    game_server_environment: row.game_server_environment ?? null,
    active_game_patch_id: row.active_game_patch_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    input: normalizeInput(row.project_inputs),
  };
}

/**
 * Supabase-backed project repository. Relies on RLS for ownership enforcement;
 * userId is still required for defense-in-depth filters.
 */
export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByUser(userId: string): Promise<ProjectRecord[]> {
    const { data, error } = await this.client
      .from('projects')
      .select('*, project_inputs(*)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }

    return ((data ?? []) as ProjectRow[]).map(mapRow);
  }

  async getById(userId: string, projectId: string): Promise<ProjectRecord | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*, project_inputs(*)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load project: ${error.message}`);
    }
    if (!data) return null;
    return mapRow(data as ProjectRow);
  }

  async create(userId: string, input: CreateProjectInput): Promise<ProjectRecord> {
    const hasBrief = Boolean(input.input?.idea?.trim() || input.initial_video_concept?.trim());
    const { data: project, error: projectError } = await this.client
      .from('projects')
      .insert({
        user_id: userId,
        name: input.name,
        category: input.category,
        visual_style: input.visual_style ?? 'automatic',
        language: input.language ?? 'en',
        target_audience: input.target_audience ?? '',
        notes: input.notes ?? '',
        captions_on_video: input.captions_on_video ?? false,
        brand_id: input.brand_id ?? null,
        niche: input.niche ?? '',
        content_purpose: input.content_purpose ?? '',
        universe_context: input.universe_context ?? '',
        dna_current_version: 0,
        legacy_single_video: hasBrief,
        workflow_state: 'IDEA_SUBMITTED',
      })
      .select('*')
      .single();

    if (projectError || !project) {
      throw new Error(`Failed to create project: ${projectError?.message ?? 'unknown error'}`);
    }

    let projectInput: ProjectInputRecord | null = null;
    const idea =
      input.input?.idea?.trim() || input.initial_video_concept?.trim() || '';
    if (idea) {
      const { data, error: inputError } = await this.client
        .from('project_inputs')
        .insert({
          project_id: project.id,
          idea,
          existing_story: input.input?.existing_story ?? '',
          additional_instructions: input.input?.additional_instructions ?? '',
          character_reference_notes: input.input?.character_reference_notes ?? '',
        })
        .select('*')
        .single();

      if (inputError || !data) {
        await this.client.from('projects').delete().eq('id', project.id);
        throw new Error(`Failed to save project input: ${inputError?.message ?? 'unknown error'}`);
      }
      projectInput = data as ProjectInputRecord;
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: project.id,
      action: 'project.created',
      entity_type: 'project',
      entity_id: project.id,
      metadata: { name: project.name, category: project.category },
    });

    return mapRow({
      ...(project as ProjectRow),
      project_inputs: projectInput,
    });
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

    const projectPatch: Record<string, unknown> = {};
    if (input.name !== undefined) projectPatch.name = input.name;
    if (input.category !== undefined) projectPatch.category = input.category;
    if (input.visual_style !== undefined) projectPatch.visual_style = input.visual_style;
    if (input.language !== undefined) projectPatch.language = input.language;
    if (input.target_audience !== undefined) projectPatch.target_audience = input.target_audience;
    if (input.notes !== undefined) projectPatch.notes = input.notes;
    if (input.captions_on_video !== undefined) {
      projectPatch.captions_on_video = input.captions_on_video;
    }
    if (input.brand_id !== undefined) projectPatch.brand_id = input.brand_id;
    if (input.niche !== undefined) projectPatch.niche = input.niche;
    if (input.content_purpose !== undefined) projectPatch.content_purpose = input.content_purpose;
    if (input.universe_context !== undefined) {
      projectPatch.universe_context = input.universe_context;
    }

    if (Object.keys(projectPatch).length > 0) {
      const { error } = await this.client
        .from('projects')
        .update(projectPatch)
        .eq('id', projectId)
        .eq('user_id', userId);
      if (error) {
        throw new Error(`Failed to update project: ${error.message}`);
      }
    }

    if (input.input) {
      const inputPatch: Record<string, unknown> = {};
      if (input.input.idea !== undefined) inputPatch.idea = input.input.idea;
      if (input.input.existing_story !== undefined) {
        inputPatch.existing_story = input.input.existing_story;
      }
      if (input.input.additional_instructions !== undefined) {
        inputPatch.additional_instructions = input.input.additional_instructions;
      }
      if (input.input.character_reference_notes !== undefined) {
        inputPatch.character_reference_notes = input.input.character_reference_notes;
      }

      if (Object.keys(inputPatch).length > 0) {
        const { error } = await this.client
          .from('project_inputs')
          .update(inputPatch)
          .eq('project_id', projectId);
        if (error) {
          throw new Error(`Failed to update project input: ${error.message}`);
        }
      }
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: projectId,
      action: 'project.updated',
      entity_type: 'project',
      entity_id: projectId,
      metadata: input,
    });

    const updated = await this.getById(userId, projectId);
    if (!updated) {
      throw new Error('Project disappeared after update');
    }
    return updated;
  }

  async softDelete(userId: string, projectId: string): Promise<void> {
    const { error } = await this.client
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: projectId,
      action: 'project.soft_deleted',
      entity_type: 'project',
      entity_id: projectId,
      metadata: {},
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

    const { error } = await this.client
      .from('projects')
      .update({ workflow_state: state })
      .eq('id', projectId)
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Failed to update workflow state: ${error.message}`);
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: projectId,
      action: 'project.workflow_transition',
      entity_type: 'project',
      entity_id: projectId,
      metadata: { from: existing.workflow_state, to: state },
    });

    const updated = await this.getById(userId, projectId);
    if (!updated) {
      throw new Error('Project disappeared after workflow update');
    }
    return updated;
  }

  async assignBrand(
    userId: string,
    projectId: string,
    brandId: string,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const { error } = await this.client
      .from('projects')
      .update({ brand_id: brandId })
      .eq('id', projectId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to assign brand: ${error.message}`);
    const updated = await this.getById(userId, projectId);
    if (!updated) throw new Error('Project disappeared after brand assign');
    return updated;
  }

  async setDnaVersion(
    userId: string,
    projectId: string,
    version: number,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const { error } = await this.client
      .from('projects')
      .update({ dna_current_version: version })
      .eq('id', projectId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to set DNA version: ${error.message}`);
    const updated = await this.getById(userId, projectId);
    if (!updated) throw new Error('Project disappeared after DNA version update');
    return updated;
  }

  async setLegacySingleVideo(
    userId: string,
    projectId: string,
    value: boolean,
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const { error } = await this.client
      .from('projects')
      .update({ legacy_single_video: value })
      .eq('id', projectId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to set legacy_single_video: ${error.message}`);
    const updated = await this.getById(userId, projectId);
    if (!updated) throw new Error('Project disappeared after legacy flag update');
    return updated;
  }

  async setGameKnowledgeBinding(
    userId: string,
    projectId: string,
    binding: {
      game_profile_id: string | null;
      game_server_environment: ProjectRecord['game_server_environment'];
      active_game_patch_id: string | null;
    },
  ): Promise<ProjectRecord> {
    const existing = await this.getById(userId, projectId);
    if (!existing) throw new Error('Project not found');
    const { error } = await this.client
      .from('projects')
      .update({
        game_profile_id: binding.game_profile_id,
        game_server_environment: binding.game_server_environment,
        active_game_patch_id: binding.active_game_patch_id,
      })
      .eq('id', projectId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to set game knowledge binding: ${error.message}`);
    const updated = await this.getById(userId, projectId);
    if (!updated) throw new Error('Project disappeared after game knowledge bind');
    return updated;
  }
}
