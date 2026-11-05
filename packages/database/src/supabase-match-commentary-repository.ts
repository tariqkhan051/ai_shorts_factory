import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MatchCommentaryRepository,
  MatchCommentaryScriptRecord,
  SaveMatchCommentaryInput,
} from './match-commentary-types.js';

function mapRow(row: Record<string, unknown>): MatchCommentaryScriptRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    match_studio_run_id: row.match_studio_run_id ? String(row.match_studio_run_id) : null,
    timeline_id: String(row.timeline_id),
    match_source_id: String(row.match_source_id),
    server_environment: row.server_environment as MatchCommentaryScriptRecord['server_environment'],
    game_patch_id: row.game_patch_id ? String(row.game_patch_id) : null,
    style: row.style as MatchCommentaryScriptRecord['style'],
    approval_status: row.approval_status as MatchCommentaryScriptRecord['approval_status'],
    script: row.script_json as MatchCommentaryScriptRecord['script'],
    segments: (row.segments_json as unknown[]) ?? [],
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class SupabaseMatchCommentaryRepository implements MatchCommentaryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saveScript(
    userId: string,
    input: SaveMatchCommentaryInput,
  ): Promise<MatchCommentaryScriptRecord> {
    const id = input.id ?? randomUUID();
    const { data, error } = await this.client
      .from('match_commentary_scripts')
      .upsert(
        {
          id,
          user_id: userId,
          match_studio_run_id: input.match_studio_run_id ?? null,
          timeline_id: input.timeline_id,
          match_source_id: input.match_source_id,
          server_environment: input.server_environment,
          game_patch_id: input.game_patch_id ?? null,
          style: input.style,
          approval_status: input.approval_status ?? 'draft',
          script_json: input.script,
          segments_json: input.segments ?? [],
          notes: input.notes ?? '',
        },
        { onConflict: 'id' },
      )
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to save commentary script: ${error?.message ?? 'unknown'}`);
    }
    return mapRow(data as Record<string, unknown>);
  }

  async getScript(
    userId: string,
    scriptId: string,
  ): Promise<MatchCommentaryScriptRecord | null> {
    const { data, error } = await this.client
      .from('match_commentary_scripts')
      .select('*')
      .eq('id', scriptId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load commentary script: ${error.message}`);
    return data ? mapRow(data as Record<string, unknown>) : null;
  }

  async listForTimeline(
    userId: string,
    timelineId: string,
  ): Promise<MatchCommentaryScriptRecord[]> {
    const { data, error } = await this.client
      .from('match_commentary_scripts')
      .select('*')
      .eq('user_id', userId)
      .eq('timeline_id', timelineId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list commentary scripts: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  }

  async listForRun(
    userId: string,
    runId: string,
  ): Promise<MatchCommentaryScriptRecord[]> {
    const { data, error } = await this.client
      .from('match_commentary_scripts')
      .select('*')
      .eq('user_id', userId)
      .eq('match_studio_run_id', runId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list commentary scripts for run: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  }
}
