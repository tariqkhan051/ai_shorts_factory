import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MATCH_EDIT_EXPORT_SCHEMA_VERSION,
  matchEditRecordSchema,
  type MatchEditPlan,
  type MatchEditRecord,
} from '@ai-shorts-factory/validation';
import type { MatchEditRepository, MatchEditStored } from './match-edit-types.js';

export class SupabaseMatchEditRepository implements MatchEditRepository {
  constructor(private readonly client: SupabaseClient) {}

  async savePlan(userId: string, plan: MatchEditPlan): Promise<MatchEditPlan> {
    const id = plan.id || randomUUID();
    const { data, error } = await this.client
      .from('match_edit_plans')
      .upsert(
        {
          id,
          user_id: userId,
          timeline_id: plan.timeline_id,
          match_source_id: plan.match_source_id,
          server_environment: plan.server_environment,
          game_patch_id: plan.game_patch_id,
          plan_json: { ...plan, id },
        },
        { onConflict: 'id' },
      )
      .select('plan_json')
      .single();
    if (error || !data) {
      throw new Error(`Failed to save match edit plan: ${error?.message ?? 'unknown'}`);
    }
    return data.plan_json as MatchEditPlan;
  }

  async getPlan(userId: string, planId: string): Promise<MatchEditPlan | null> {
    const { data, error } = await this.client
      .from('match_edit_plans')
      .select('plan_json')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load match edit plan: ${error.message}`);
    return data ? (data.plan_json as MatchEditPlan) : null;
  }

  async saveEdit(userId: string, edit: MatchEditStored): Promise<MatchEditStored> {
    if (edit.user_id !== userId) throw new Error('Edit user mismatch');
    await this.savePlan(userId, edit.plan);

    const { data, error } = await this.client
      .from('match_edits')
      .upsert(
        {
          id: edit.id,
          user_id: userId,
          plan_id: edit.plan.id,
          timeline_id: edit.plan.timeline_id,
          match_source_id: edit.plan.match_source_id,
          status: edit.status,
          artifacts_json: edit.artifacts,
          approved_at: edit.approved_at,
          notes: edit.notes ?? '',
        },
        { onConflict: 'id' },
      )
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`Failed to save match edit: ${error?.message ?? 'unknown'}`);
    }

    return {
      id: data.id,
      user_id: data.user_id,
      plan: edit.plan,
      status: data.status,
      artifacts: data.artifacts_json ?? [],
      approved_at: data.approved_at,
      notes: data.notes ?? '',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getEdit(userId: string, editId: string): Promise<MatchEditStored | null> {
    const { data, error } = await this.client
      .from('match_edits')
      .select('*')
      .eq('id', editId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load match edit: ${error.message}`);
    if (!data) return null;
    const plan = await this.getPlan(userId, data.plan_id);
    if (!plan) return null;
    return {
      id: data.id,
      user_id: data.user_id,
      plan,
      status: data.status,
      artifacts: data.artifacts_json ?? [],
      approved_at: data.approved_at,
      notes: data.notes ?? '',
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async listEditsForTimeline(
    userId: string,
    timelineId: string,
  ): Promise<MatchEditStored[]> {
    const { data, error } = await this.client
      .from('match_edits')
      .select('*')
      .eq('user_id', userId)
      .eq('timeline_id', timelineId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to list match edits: ${error.message}`);
    const results: MatchEditStored[] = [];
    for (const row of data ?? []) {
      const plan = await this.getPlan(userId, row.plan_id);
      if (!plan) continue;
      results.push({
        id: row.id,
        user_id: row.user_id,
        plan,
        status: row.status,
        artifacts: row.artifacts_json ?? [],
        approved_at: row.approved_at,
        notes: row.notes ?? '',
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
    return results;
  }

  toExport(edit: MatchEditStored): MatchEditRecord {
    return matchEditRecordSchema.parse({
      schema_version: MATCH_EDIT_EXPORT_SCHEMA_VERSION,
      id: edit.id,
      plan_id: edit.plan.id,
      timeline_id: edit.plan.timeline_id,
      match_source_id: edit.plan.match_source_id,
      status: edit.status,
      artifacts: edit.artifacts,
      approved_at: edit.approved_at,
      created_at: edit.created_at,
      updated_at: edit.updated_at,
      notes: edit.notes,
    });
  }
}
