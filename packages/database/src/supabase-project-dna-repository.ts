import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectDnaSnapshot } from '@ai-shorts-factory/validation';
import type { ProjectDnaRepository, ProjectDnaVersionRecord } from './content-platform-types.js';
import { mapDnaVersionRow } from './content-platform-mappers.js';
import type { ProjectRepository } from './types.js';

export class SupabaseProjectDnaRepository implements ProjectDnaRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projects: ProjectRepository,
  ) {}

  private async requireProject(userId: string, projectId: string) {
    const project = await this.projects.getById(userId, projectId);
    if (!project) throw new Error('Project not found');
    return project;
  }

  async getCurrent(userId: string, projectId: string): Promise<ProjectDnaVersionRecord | null> {
    const project = await this.requireProject(userId, projectId);
    if (!project.dna_current_version) return null;
    return this.getVersion(userId, projectId, project.dna_current_version);
  }

  async getVersion(
    userId: string,
    projectId: string,
    version: number,
  ): Promise<ProjectDnaVersionRecord | null> {
    await this.requireProject(userId, projectId);
    const { data, error } = await this.client
      .from('project_dna_versions')
      .select('*')
      .eq('project_id', projectId)
      .eq('version', version)
      .maybeSingle();
    if (error) throw new Error(`Failed to load DNA version: ${error.message}`);
    return data ? mapDnaVersionRow(data) : null;
  }

  async listVersions(userId: string, projectId: string): Promise<ProjectDnaVersionRecord[]> {
    await this.requireProject(userId, projectId);
    const { data, error } = await this.client
      .from('project_dna_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: true });
    if (error) throw new Error(`Failed to list DNA versions: ${error.message}`);
    return (data ?? []).map((row) => mapDnaVersionRow(row));
  }

  async seedInitial(
    userId: string,
    projectId: string,
    snapshot: ProjectDnaSnapshot,
  ): Promise<ProjectDnaVersionRecord> {
    await this.requireProject(userId, projectId);
    const existing = await this.listVersions(userId, projectId);
    if (existing.length > 0) throw new Error('Project DNA already seeded');

    const { data, error } = await this.client
      .from('project_dna_versions')
      .insert({
        project_id: projectId,
        version: 1,
        snapshot,
        note: 'Initial Project DNA',
        created_by: userId,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to seed DNA: ${error?.message ?? 'unknown'}`);
    }

    if (this.projects.setDnaVersion) {
      await this.projects.setDnaVersion(userId, projectId, 1);
    } else {
      await this.client
        .from('projects')
        .update({ dna_current_version: 1 })
        .eq('id', projectId)
        .eq('user_id', userId);
    }

    return mapDnaVersionRow(data);
  }

  async publishVersion(
    userId: string,
    projectId: string,
    snapshot: ProjectDnaSnapshot,
    note = '',
  ): Promise<ProjectDnaVersionRecord> {
    await this.requireProject(userId, projectId);
    const versions = await this.listVersions(userId, projectId);
    const nextVersion =
      versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.version)) + 1;

    const { data, error } = await this.client
      .from('project_dna_versions')
      .insert({
        project_id: projectId,
        version: nextVersion,
        snapshot,
        note,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to publish DNA: ${error?.message ?? 'unknown'}`);
    }

    if (this.projects.setDnaVersion) {
      await this.projects.setDnaVersion(userId, projectId, nextVersion);
    } else {
      await this.client
        .from('projects')
        .update({ dna_current_version: nextVersion })
        .eq('id', projectId)
        .eq('user_id', userId);
    }

    return mapDnaVersionRow(data);
  }
}
