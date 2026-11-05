import { randomUUID } from 'node:crypto';
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

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryMatchStudioRepository implements MatchStudioRepository {
  private readonly runs = new Map<string, MatchStudioRunRecord>();

  clear(): void {
    this.runs.clear();
  }

  async createRun(
    userId: string,
    input: CreateMatchStudioRunRecordInput,
  ): Promise<MatchStudioRunRecord> {
    const timestamp = nowIso();
    const record: MatchStudioRunRecord = {
      id: randomUUID(),
      user_id: userId,
      project_id: input.project_id,
      match_source_id: input.match_source_id ?? null,
      title: input.title,
      status: input.status ?? 'draft',
      patch_resolution: input.patch_resolution,
      server_environment: input.server_environment,
      game_profile_id: input.game_profile_id,
      game_patch_id: input.game_patch_id,
      last_error: null,
      capability_flags: input.capability_flags ?? emptyMatchStudioCapabilityFlags(),
      commentary_style: input.commentary_style ?? 'esports_caster',
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.runs.set(record.id, record);
    return structuredClone(record);
  }

  async updateRun(
    userId: string,
    runId: string,
    input: UpdateMatchStudioRunInput,
  ): Promise<MatchStudioRunRecord> {
    const existing = await this.getRun(userId, runId);
    if (!existing) throw new Error('Match Studio run not found');
    const updated: MatchStudioRunRecord = {
      ...existing,
      ...input,
      capability_flags: (input.capability_flags ??
        existing.capability_flags) as MatchStudioCapabilityFlags,
      updated_at: nowIso(),
    };
    this.runs.set(runId, updated);
    return structuredClone(updated);
  }

  async getRun(userId: string, runId: string): Promise<MatchStudioRunRecord | null> {
    const run = this.runs.get(runId);
    if (!run || run.user_id !== userId) return null;
    return structuredClone(run);
  }

  async listRuns(userId: string): Promise<MatchStudioRunRecord[]> {
    return [...this.runs.values()]
      .filter((r) => r.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => structuredClone(r));
  }

  async getRunByProject(userId: string, projectId: string): Promise<MatchStudioRunRecord | null> {
    const run = [...this.runs.values()].find(
      (r) => r.user_id === userId && r.project_id === projectId,
    );
    return run ? structuredClone(run) : null;
  }

  exportAll(): MatchStudioRunRecord[] {
    return [...this.runs.values()].map((r) => structuredClone(r));
  }

  importAll(runs: MatchStudioRunRecord[]): void {
    this.clear();
    for (const run of runs) {
      this.runs.set(run.id, run);
    }
  }
}
