import type { KbSyncRun } from '@ai-shorts-factory/validation';

export type KbSyncChecksumRecord = {
  content_sha256: string;
  path: string;
  last_status: string;
  draft_patch_id: string | null;
  updated_at: string;
};

export interface KbSyncRepository {
  getChecksum(userId: string, contentSha256: string): Promise<KbSyncChecksumRecord | null>;
  saveChecksum(userId: string, record: KbSyncChecksumRecord): Promise<KbSyncChecksumRecord>;
  saveRun(userId: string, run: KbSyncRun): Promise<KbSyncRun>;
  listRuns(userId: string, limit?: number): Promise<KbSyncRun[]>;
}
