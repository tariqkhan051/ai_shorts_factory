import type { KbSyncRun } from '@ai-shorts-factory/validation';
import type { KbSyncChecksumRecord, KbSyncRepository } from './kb-sync-types.js';

export class MemoryKbSyncRepository implements KbSyncRepository {
  private readonly checksums = new Map<string, KbSyncChecksumRecord>();
  private readonly runs: Array<{ user_id: string; run: KbSyncRun }> = [];

  clear(): void {
    this.checksums.clear();
    this.runs.length = 0;
  }

  private key(userId: string, sha: string): string {
    return `${userId}:${sha}`;
  }

  async getChecksum(
    userId: string,
    contentSha256: string,
  ): Promise<KbSyncChecksumRecord | null> {
    const record = this.checksums.get(this.key(userId, contentSha256));
    return record ? structuredClone(record) : null;
  }

  async saveChecksum(
    userId: string,
    record: KbSyncChecksumRecord,
  ): Promise<KbSyncChecksumRecord> {
    const saved = structuredClone(record);
    this.checksums.set(this.key(userId, saved.content_sha256), saved);
    return structuredClone(saved);
  }

  async saveRun(userId: string, run: KbSyncRun): Promise<KbSyncRun> {
    const saved = structuredClone(run);
    this.runs.unshift({ user_id: userId, run: saved });
    return structuredClone(saved);
  }

  async listRuns(userId: string, limit = 20): Promise<KbSyncRun[]> {
    return this.runs
      .filter((r) => r.user_id === userId)
      .slice(0, limit)
      .map((r) => structuredClone(r.run));
  }

  exportAll(): {
    checksums: KbSyncChecksumRecord[];
    runs: KbSyncRun[];
  } {
    return {
      checksums: [...this.checksums.values()].map((c) => structuredClone(c)),
      runs: this.runs.map((r) => structuredClone(r.run)),
    };
  }

  importAll(data: { checksums?: KbSyncChecksumRecord[]; runs?: KbSyncRun[]; userId?: string }): void {
    const userId = data.userId ?? 'local-dev-user';
    for (const checksum of data.checksums ?? []) {
      this.checksums.set(this.key(userId, checksum.content_sha256), structuredClone(checksum));
    }
    for (const run of data.runs ?? []) {
      this.runs.push({ user_id: userId, run: structuredClone(run) });
    }
  }
}
