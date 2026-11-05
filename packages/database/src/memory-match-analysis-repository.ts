import { randomUUID } from 'node:crypto';
import type {
  CreateMatchSourceInput,
  MatchAnalysisJobRecord,
  MatchAnalysisRepository,
  MatchSourceRecord,
  UpdateMatchSourceInput,
} from './match-analysis-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class MemoryMatchAnalysisRepository implements MatchAnalysisRepository {
  private readonly sources = new Map<string, MatchSourceRecord>();
  private readonly jobs = new Map<string, MatchAnalysisJobRecord>();

  clear(): void {
    this.sources.clear();
    this.jobs.clear();
  }

  async createSource(userId: string, input: CreateMatchSourceInput): Promise<MatchSourceRecord> {
    const timestamp = nowIso();
    const record: MatchSourceRecord = {
      id: randomUUID(),
      user_id: userId,
      project_id: input.project_id ?? null,
      title: input.title,
      storage_key: input.storage_key ?? null,
      local_path: input.local_path ?? null,
      content_checksum_sha256: input.content_checksum_sha256 ?? null,
      byte_size: input.byte_size ?? null,
      duration_seconds: input.duration_seconds ?? null,
      server_environment: input.server_environment,
      game_patch_id: input.game_patch_id ?? null,
      probe_json: input.probe_json ?? {},
      ingest_status: input.ingest_status ?? 'registered',
      original_filename: input.original_filename ?? '',
      notes: input.notes ?? '',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    this.sources.set(record.id, record);
    return structuredClone(record);
  }

  async updateSource(
    userId: string,
    sourceId: string,
    input: UpdateMatchSourceInput,
  ): Promise<MatchSourceRecord> {
    const existing = await this.getSource(userId, sourceId);
    if (!existing) throw new Error('Match source not found');
    const updated: MatchSourceRecord = {
      ...existing,
      ...input,
      updated_at: nowIso(),
    };
    this.sources.set(sourceId, updated);
    return structuredClone(updated);
  }

  async getSource(userId: string, sourceId: string): Promise<MatchSourceRecord | null> {
    const source = this.sources.get(sourceId);
    if (!source || source.user_id !== userId || source.deleted_at) return null;
    return structuredClone(source);
  }

  async listSources(userId: string): Promise<MatchSourceRecord[]> {
    return [...this.sources.values()]
      .filter((s) => s.user_id === userId && !s.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => structuredClone(s));
  }

  async listSourcesByProject(userId: string, projectId: string): Promise<MatchSourceRecord[]> {
    return (await this.listSources(userId)).filter((s) => s.project_id === projectId);
  }

  async getJobByCacheKey(
    userId: string,
    matchSourceId: string,
    cacheKey: string,
  ): Promise<MatchAnalysisJobRecord | null> {
    const job = [...this.jobs.values()].find(
      (j) =>
        j.user_id === userId &&
        j.match_source_id === matchSourceId &&
        j.cache_key === cacheKey,
    );
    return job ? structuredClone(job) : null;
  }

  async saveJob(userId: string, job: MatchAnalysisJobRecord): Promise<MatchAnalysisJobRecord> {
    if (job.user_id !== userId) throw new Error('Job user mismatch');
    const updated = { ...job, updated_at: nowIso() };
    this.jobs.set(job.id, updated);
    return structuredClone(updated);
  }

  async listJobsForSource(
    userId: string,
    matchSourceId: string,
  ): Promise<MatchAnalysisJobRecord[]> {
    return [...this.jobs.values()]
      .filter((j) => j.user_id === userId && j.match_source_id === matchSourceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => structuredClone(j));
  }

  exportAll(): { sources: MatchSourceRecord[]; jobs: MatchAnalysisJobRecord[] } {
    return {
      sources: [...this.sources.values()].map((s) => structuredClone(s)),
      jobs: [...this.jobs.values()].map((j) => structuredClone(j)),
    };
  }

  importAll(snapshot: {
    sources?: MatchSourceRecord[];
    jobs?: MatchAnalysisJobRecord[];
  }): void {
    this.clear();
    for (const source of snapshot.sources ?? []) {
      this.sources.set(source.id, {
        ...source,
        project_id: source.project_id ?? null,
        probe_json: source.probe_json ?? {},
        ingest_status: source.ingest_status ?? 'registered',
        original_filename: source.original_filename ?? '',
        game_patch_id: source.game_patch_id ?? null,
      });
    }
    for (const job of snapshot.jobs ?? []) {
      this.jobs.set(job.id, job);
    }
  }
}
