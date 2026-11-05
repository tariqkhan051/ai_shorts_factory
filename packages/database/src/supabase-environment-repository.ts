import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateEnvironmentPayload,
  UpdateEnvironmentPayload,
} from '@ai-shorts-factory/validation';
import type {
  EnvironmentRecord,
  EnvironmentRepository,
} from './content-platform-types.js';
import { mapEnvironmentRow } from './content-platform-mappers.js';
import type { ProjectRepository } from './types.js';

export class SupabaseEnvironmentRepository implements EnvironmentRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projects: ProjectRepository,
  ) {}

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) throw new Error('Project not found');
    return project;
  }

  async listByProject(userId: string, projectId: string): Promise<EnvironmentRecord[]> {
    await this.requireProject(userId, projectId);
    const { data, error } = await this.client
      .from('environments')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to list environments: ${error.message}`);
    return (data ?? []).map((row) => mapEnvironmentRow(row));
  }

  async getById(userId: string, environmentId: string): Promise<EnvironmentRecord | null> {
    const { data, error } = await this.client
      .from('environments')
      .select('*')
      .eq('id', environmentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load environment: ${error.message}`);
    return data ? mapEnvironmentRow(data) : null;
  }

  async create(
    userId: string,
    projectId: string,
    input: CreateEnvironmentPayload,
  ): Promise<EnvironmentRecord> {
    await this.requireProject(userId, projectId);
    const { data, error } = await this.client
      .from('environments')
      .insert({
        project_id: projectId,
        user_id: userId,
        name: input.name,
        kind: input.kind ?? 'location',
        description: input.description ?? '',
        visual_identity: input.visual_identity ?? '',
        continuity_rules: input.continuity_rules ?? '',
        reference_image_prompt: input.reference_image_prompt ?? '',
        active: true,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create environment: ${error?.message ?? 'unknown'}`);
    }
    return mapEnvironmentRow(data);
  }

  async update(
    userId: string,
    environmentId: string,
    input: UpdateEnvironmentPayload,
  ): Promise<EnvironmentRecord> {
    const existing = await this.getById(userId, environmentId);
    if (!existing) throw new Error('Environment not found');

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.description !== undefined) patch.description = input.description;
    if (input.visual_identity !== undefined) patch.visual_identity = input.visual_identity;
    if (input.continuity_rules !== undefined) patch.continuity_rules = input.continuity_rules;
    if (input.reference_image_prompt !== undefined) {
      patch.reference_image_prompt = input.reference_image_prompt;
    }
    if (input.active !== undefined) patch.active = input.active;

    const { error } = await this.client
      .from('environments')
      .update(patch)
      .eq('id', environmentId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update environment: ${error.message}`);

    const updated = await this.getById(userId, environmentId);
    if (!updated) throw new Error('Environment disappeared after update');
    return updated;
  }

  async archive(userId: string, environmentId: string): Promise<EnvironmentRecord> {
    return this.update(userId, environmentId, { active: false });
  }
}
