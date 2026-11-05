import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateMatchSourceInput,
  MatchAnalysisJobRecord,
  MatchAnalysisRepository,
  MatchSourceRecord,
  UpdateMatchSourceInput,
} from './match-analysis-types.js';

type MatchSourceRow = MatchSourceRecord;

function mapSource(row: MatchSourceRow): MatchSourceRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id ?? null,
    title: row.title,
    storage_key: row.storage_key ?? null,
    local_path: row.local_path ?? null,
    content_checksum_sha256: row.content_checksum_sha256 ?? null,
    byte_size: row.byte_size ?? null,
    duration_seconds: row.duration_seconds ?? null,
    server_environment: row.server_environment,
    game_patch_id: row.game_patch_id ?? null,
    probe_json: (row.probe_json as Record<string, unknown>) ?? {},
    ingest_status: row.ingest_status ?? 'registered',
    original_filename: row.original_filename ?? '',
    notes: row.notes ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

function mapJob(row: Record<string, unknown>): MatchAnalysisJobRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    match_source_id: String(row.match_source_id),
    status: row.status as MatchAnalysisJobRecord['status'],
    cache_key: String(row.cache_key),
    recognition_config: (row.recognition_config ?? {}) as MatchAnalysisJobRecord['recognition_config'],
    result: (row.result ?? {}) as MatchAnalysisJobRecord['result'],
    error_message: row.error_message ? String(row.error_message) : null,
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class SupabaseMatchAnalysisRepository implements MatchAnalysisRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createSource(userId: string, input: CreateMatchSourceInput): Promise<MatchSourceRecord> {
    const { data, error } = await this.client
      .from('match_sources')
      .insert({
        user_id: userId,
        project_id: input.project_id ?? null,
        title: input.title,
        storage_key: input.storage_key ?? null,
        local_path: input.local_path,
        content_checksum_sha256: input.content_checksum_sha256 ?? null,
        byte_size: input.byte_size ?? null,
        duration_seconds: input.duration_seconds ?? null,
        server_environment: input.server_environment,
        game_patch_id: input.game_patch_id ?? null,
        probe_json: input.probe_json ?? {},
        ingest_status: input.ingest_status ?? 'registered',
        original_filename: input.original_filename ?? '',
        notes: input.notes ?? '',
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to create match source: ${error?.message ?? 'unknown'}`);
    }
    return mapSource(data as MatchSourceRow);
  }

  async updateSource(
    userId: string,
    sourceId: string,
    input: UpdateMatchSourceInput,
  ): Promise<MatchSourceRecord> {
    const existing = await this.getSource(userId, sourceId);
    if (!existing) throw new Error('Match source not found');

    const { error } = await this.client
      .from('match_sources')
      .update(input)
      .eq('id', sourceId)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw new Error(`Failed to update match source: ${error.message}`);

    const updated = await this.getSource(userId, sourceId);
    if (!updated) throw new Error('Match source disappeared after update');
    return updated;
  }

  async getSource(userId: string, sourceId: string): Promise<MatchSourceRecord | null> {
    const { data, error } = await this.client
      .from('match_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Failed to load match source: ${error.message}`);
    return data ? mapSource(data as MatchSourceRow) : null;
  }

  async listSources(userId: string): Promise<MatchSourceRecord[]> {
    const { data, error } = await this.client
      .from('match_sources')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list match sources: ${error.message}`);
    return ((data ?? []) as MatchSourceRow[]).map(mapSource);
  }

  async listSourcesByProject(userId: string, projectId: string): Promise<MatchSourceRecord[]> {
    const { data, error } = await this.client
      .from('match_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list match sources by project: ${error.message}`);
    return ((data ?? []) as MatchSourceRow[]).map(mapSource);
  }

  async getJobByCacheKey(
    userId: string,
    matchSourceId: string,
    cacheKey: string,
  ): Promise<MatchAnalysisJobRecord | null> {
    const { data, error } = await this.client
      .from('match_analysis_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('match_source_id', matchSourceId)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error) throw new Error(`Failed to load analysis job: ${error.message}`);
    return data ? mapJob(data as Record<string, unknown>) : null;
  }

  async saveJob(userId: string, job: MatchAnalysisJobRecord): Promise<MatchAnalysisJobRecord> {
    if (job.user_id !== userId) throw new Error('Job user mismatch');
    const id = job.id || randomUUID();
    const row = {
      id,
      user_id: userId,
      match_source_id: job.match_source_id,
      status: job.status,
      cache_key: job.cache_key,
      recognition_config: job.recognition_config,
      result: job.result,
      error_message: job.error_message,
      started_at: job.started_at,
      completed_at: job.completed_at,
    };
    const { data, error } = await this.client
      .from('match_analysis_jobs')
      .upsert(row, { onConflict: 'match_source_id,cache_key' })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to save analysis job: ${error?.message ?? 'unknown'}`);
    }
    return mapJob(data as Record<string, unknown>);
  }

  async listJobsForSource(
    userId: string,
    matchSourceId: string,
  ): Promise<MatchAnalysisJobRecord[]> {
    const { data, error } = await this.client
      .from('match_analysis_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('match_source_id', matchSourceId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list analysis jobs: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapJob);
  }
}
