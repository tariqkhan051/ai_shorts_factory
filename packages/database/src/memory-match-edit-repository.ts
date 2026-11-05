import { randomUUID } from 'node:crypto';
import {
  MATCH_EDIT_EXPORT_SCHEMA_VERSION,
  matchEditRecordSchema,
  type MatchEditPlan,
  type MatchEditRecord,
} from '@ai-shorts-factory/validation';
import type { MatchEditRepository, MatchEditStored } from './match-edit-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryMatchEditRepository implements MatchEditRepository {
  private readonly plans = new Map<string, MatchEditPlan & { user_id: string }>();
  private readonly edits = new Map<string, MatchEditStored>();

  clear(): void {
    this.plans.clear();
    this.edits.clear();
  }

  importAll(data: {
    plans?: Array<MatchEditPlan & { user_id: string }>;
    edits?: MatchEditStored[];
  }): void {
    for (const plan of data.plans ?? []) {
      this.plans.set(plan.id, structuredClone(plan));
    }
    for (const edit of data.edits ?? []) {
      this.edits.set(edit.id, structuredClone(edit));
    }
  }

  exportAll(): {
    plans: Array<MatchEditPlan & { user_id: string }>;
    edits: MatchEditStored[];
  } {
    return {
      plans: [...this.plans.values()].map((p) => structuredClone(p)),
      edits: [...this.edits.values()].map((e) => structuredClone(e)),
    };
  }

  async savePlan(userId: string, plan: MatchEditPlan): Promise<MatchEditPlan> {
    const saved = structuredClone(plan);
    this.plans.set(saved.id, { ...saved, user_id: userId });
    return structuredClone(saved);
  }

  async getPlan(userId: string, planId: string): Promise<MatchEditPlan | null> {
    const plan = this.plans.get(planId);
    if (!plan || plan.user_id !== userId) return null;
    const { user_id: _userId, ...rest } = plan;
    void _userId;
    return structuredClone(rest);
  }

  async saveEdit(userId: string, edit: MatchEditStored): Promise<MatchEditStored> {
    if (edit.user_id !== userId) throw new Error('Edit user mismatch');
    const saved = {
      ...structuredClone(edit),
      updated_at: nowIso(),
    };
    this.edits.set(saved.id, saved);
    return structuredClone(saved);
  }

  async getEdit(userId: string, editId: string): Promise<MatchEditStored | null> {
    const edit = this.edits.get(editId);
    if (!edit || edit.user_id !== userId) return null;
    return structuredClone(edit);
  }

  async listEditsForTimeline(userId: string, timelineId: string): Promise<MatchEditStored[]> {
    return [...this.edits.values()]
      .filter((e) => e.user_id === userId && e.plan.timeline_id === timelineId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((e) => structuredClone(e));
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

  createEmptyEdit(userId: string, plan: MatchEditPlan): MatchEditStored {
    const now = nowIso();
    return {
      id: randomUUID(),
      user_id: userId,
      plan: structuredClone(plan),
      status: 'planned',
      artifacts: [],
      approved_at: null,
      notes: '',
      created_at: now,
      updated_at: now,
    };
  }
}
