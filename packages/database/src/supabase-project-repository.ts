import type { SupabaseClient } from '@supabase/supabase-js';
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
        workflow_state: 'IDEA_SUBMITTED',
      })
      .select('*')
      .single();

    if (projectError || !project) {
      throw new Error(`Failed to create project: ${projectError?.message ?? 'unknown error'}`);
    }

    const { data: projectInput, error: inputError } = await this.client
      .from('project_inputs')
      .insert({
        project_id: project.id,
        idea: input.input.idea,
        existing_story: input.input.existing_story ?? '',
        additional_instructions: input.input.additional_instructions ?? '',
        character_reference_notes: input.input.character_reference_notes ?? '',
      })
      .select('*')
      .single();

    if (inputError || !projectInput) {
      await this.client.from('projects').delete().eq('id', project.id);
      throw new Error(`Failed to save project input: ${inputError?.message ?? 'unknown error'}`);
    }

    await this.client.from('audit_logs').insert({
      user_id: userId,
      project_id: project.id,
      action: 'project.created',
      entity_type: 'project',
      entity_id: project.id,
      metadata: { name: project.name, category: project.category },
    });

    return mapRow({ ...(project as ProjectRow), project_inputs: projectInput as ProjectInputRecord });
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
}
