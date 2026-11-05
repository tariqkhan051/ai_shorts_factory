import type { MatchStudioRunRecord } from './match-studio-types.js';
import type { MatchSourceRecord } from './match-analysis-types.js';

/** Minimal job shape for ownership checks (avoids depending on workflow-engine). */
export type MatchStudioJobOwnershipView = {
  userId?: string;
  payload?: Record<string, unknown>;
};

/**
 * Worker/service-role paths bypass RLS. Call these before mutating Match Studio data.
 */

export function assertRunOwnedByUser(
  run: MatchStudioRunRecord | null | undefined,
  userId: string,
  label = 'Match Studio run',
): asserts run is MatchStudioRunRecord {
  if (!run || run.user_id !== userId) {
    throw new Error(`${label} not found or not owned by requester`);
  }
}

export function assertSourceOwnedByUser(
  source: MatchSourceRecord | null | undefined,
  userId: string,
  label = 'Match source',
): asserts source is MatchSourceRecord {
  if (!source || source.user_id !== userId) {
    throw new Error(`${label} not found or not owned by requester`);
  }
}

export function assertJobOwnedByUser(
  job: MatchStudioJobOwnershipView | null | undefined,
  userId: string,
  projectUserId?: string,
): asserts job is MatchStudioJobOwnershipView {
  if (!job) throw new Error('Workflow job not found');
  const payloadUser = String(
    (job.payload as { userId?: string } | undefined)?.userId ?? job.userId ?? '',
  );
  if (payloadUser && payloadUser !== userId) {
    throw new Error('Workflow job user mismatch');
  }
  if (projectUserId && projectUserId !== userId) {
    throw new Error('Workflow job project ownership mismatch');
  }
}

export function buildMatchStudioStorageKeyPrefix(userId: string, runId: string): string {
  const userPart = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const runPart = runId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `users/${userPart}/match-studio/${runPart}/`;
}

export function assertStorageKeyBelongsToRun(
  key: string,
  userId: string,
  runId: string,
): void {
  const prefix = buildMatchStudioStorageKeyPrefix(userId, runId);
  if (!key.startsWith(prefix)) {
    throw new Error('Storage key is outside the authorized Match Studio run prefix');
  }
  if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
    throw new Error('Invalid storage key');
  }
}
