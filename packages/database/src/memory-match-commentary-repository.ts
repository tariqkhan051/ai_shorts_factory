import { randomUUID } from 'node:crypto';
import type {
  MatchCommentaryRepository,
  MatchCommentaryScriptRecord,
  SaveMatchCommentaryInput,
} from './match-commentary-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryMatchCommentaryRepository implements MatchCommentaryRepository {
  private readonly scripts = new Map<string, MatchCommentaryScriptRecord>();

  clear(): void {
    this.scripts.clear();
  }

  async saveScript(
    userId: string,
    input: SaveMatchCommentaryInput,
  ): Promise<MatchCommentaryScriptRecord> {
    const timestamp = nowIso();
    const id = input.id ?? randomUUID();
    const existing = this.scripts.get(id);
    if (existing && existing.user_id !== userId) {
      throw new Error('Commentary script user mismatch');
    }
    const record: MatchCommentaryScriptRecord = {
      id,
      user_id: userId,
      match_studio_run_id: input.match_studio_run_id ?? null,
      timeline_id: input.timeline_id,
      match_source_id: input.match_source_id,
      server_environment: input.server_environment,
      game_patch_id: input.game_patch_id ?? null,
      style: input.style,
      approval_status: input.approval_status ?? 'draft',
      script: structuredClone(input.script),
      segments: structuredClone(input.segments ?? []),
      notes: input.notes ?? '',
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    this.scripts.set(id, record);
    return structuredClone(record);
  }

  async getScript(
    userId: string,
    scriptId: string,
  ): Promise<MatchCommentaryScriptRecord | null> {
    const script = this.scripts.get(scriptId);
    if (!script || script.user_id !== userId) return null;
    return structuredClone(script);
  }

  async listForTimeline(
    userId: string,
    timelineId: string,
  ): Promise<MatchCommentaryScriptRecord[]> {
    return [...this.scripts.values()]
      .filter((s) => s.user_id === userId && s.timeline_id === timelineId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((s) => structuredClone(s));
  }

  async listForRun(
    userId: string,
    runId: string,
  ): Promise<MatchCommentaryScriptRecord[]> {
    return [...this.scripts.values()]
      .filter((s) => s.user_id === userId && s.match_studio_run_id === runId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((s) => structuredClone(s));
  }
}
