import type { SupabaseClient } from '@supabase/supabase-js';
import {
  emptyMatchStudioCapabilityFlags,
  type MatchStudioCapabilityFlags,
} from '@ai-shorts-factory/validation';
import type {
  CreateMatchStudioRunRecordInput,
  MatchStudioRepository,
  MatchStudioRunRecord,
  UpdateMatchStudioRunInput,
} from './match-studio-types.js';

type MatchStudioRunRow = {
  id: string;
  user_id: string;
  project_id: string;
  match_source_id: string | null;
  title: string;
  status: MatchStudioRunRecord['status'];
  patch_resolution: MatchStudioRunRecord['patch_resolution'];
  server_environment: MatchStudioRunRecord['server_environment'];
  game_profile_id: string;
  game_patch_id: string | null;
  last_error: string | null;
  capability_flags: MatchStudioCapabilityFlags | Record<string, unknown> | null;
  commentary_style: MatchStudioRunRecord['commentary_style'];
  created_at: string;
  updated_at: string;
};

function mapRow(row: MatchStudioRunRow): MatchStudioRunRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    match_source_id: row.match_source_id,
    title: row.title,
    status: row.status,
    patch_resolution: row.patch_resolution,
    server_environment: row.server_environment,
    game_profile_id: row.game_profile_id,
    game_patch_id: row.game_patch_id,
    last_error: row.last_error,
    capability_flags: emptyMatchStudioCapabilityFlags(
      (row.capability_flags ?? {}) as Partial<MatchStudioCapabilityFlags>,
    ),
    commentary_style: row.commentary_style ?? 'esports_caster',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Supabase-backed Match Studio runs. Relies on RLS; userId filters are defense-in-depth.
 */
export class SupabaseMatchStudioRepository implements MatchStudioRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createRun(
    userId: string,
    input: CreateMatchStudioRunRecordInput,
  ): Promise<MatchStudioRunRecord> {
    const { data, error } = await this.client
      .from('match_studio_runs')
      .insert({
        user_id: userId,
        project_id: input.project_id,
        match_source_id: input.match_source_id ?? null,
        title: input.title,
        status: input.status ?? 'draft',
        patch_resolution: input.patch_resolution,
        server_environment: input.server_environment,
        game_profile_id: input.game_profile_id,
        game_patch_id: input.game_patch_id,
        capability_flags: input.capability_flags ?? emptyMatchStudioCapabilityFlags(),
        commentary_style: input.commentary_style ?? 'esports_caster',
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create Match Studio run: ${error?.message ?? 'unknown'}`);
    }
    return mapRow(data as MatchStudioRunRow);
  }

  async updateRun(
    userId: string,
    runId: string,
    input: UpdateMatchStudioRunInput,
  ): Promise<MatchStudioRunRecord> {
    const existing = await this.getRun(userId, runId);
    if (!existing) throw new Error('Match Studio run not found');

    const patch: Record<string, unknown> = {};
    if (input.match_source_id !== undefined) patch.match_source_id = input.match_source_id;
    if (input.status !== undefined) patch.status = input.status;
    if (input.patch_resolution !== undefined) patch.patch_resolution = input.patch_resolution;
    if (input.game_patch_id !== undefined) patch.game_patch_id = input.game_patch_id;
    if (input.last_error !== undefined) patch.last_error = input.last_error;
    if (input.capability_flags !== undefined) patch.capability_flags = input.capability_flags;
    if (input.commentary_style !== undefined) patch.commentary_style = input.commentary_style;
    if (input.title !== undefined) patch.title = input.title;

    const { error } = await this.client
      .from('match_studio_runs')
      .update(patch)
      .eq('id', runId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to update Match Studio run: ${error.message}`);

    const updated = await this.getRun(userId, runId);
    if (!updated) throw new Error('Match Studio run disappeared after update');
    return updated;
  }

  async getRun(userId: string, runId: string): Promise<MatchStudioRunRecord | null> {
    const { data, error } = await this.client
      .from('match_studio_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load Match Studio run: ${error.message}`);
    return data ? mapRow(data as MatchStudioRunRow) : null;
  }

  async listRuns(userId: string): Promise<MatchStudioRunRecord[]> {
    const { data, error } = await this.client
      .from('match_studio_runs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list Match Studio runs: ${error.message}`);
    return ((data ?? []) as MatchStudioRunRow[]).map(mapRow);
  }

  async getRunByProject(
    userId: string,
    projectId: string,
  ): Promise<MatchStudioRunRecord | null> {
    const { data, error } = await this.client
      .from('match_studio_runs')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to load Match Studio run by project: ${error.message}`);
    return data ? mapRow(data as MatchStudioRunRow) : null;
  }
}
