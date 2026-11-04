import type { JobQueue, WorkflowJobRecord, WorkflowJobType } from './job-types.js';

const ACTIVE_STATES = new Set(['queued', 'leased']);

/**
 * Builds a stable enqueue key for the next attempt of a job type on a project.
 * Reuses the active job key when a queued/leased job already exists (double-submit safe).
 */
export async function nextJobIdempotencyKey(
  queue: JobQueue,
  projectId: string,
  jobType: WorkflowJobType,
  baseKey: string,
): Promise<{ idempotencyKey: string; existing?: WorkflowJobRecord }> {
  const jobs = await queue.listByProject(projectId);
  const matching = jobs.filter((job) => job.jobType === jobType);
  const active = matching.find((job) => ACTIVE_STATES.has(job.state));
  if (active) {
    return { idempotencyKey: active.idempotencyKey, existing: active };
  }

  const terminalCount = matching.filter(
    (job) => job.state === 'completed' || job.state === 'failed',
  ).length;
  return { idempotencyKey: `${baseKey}:attempt:${terminalCount + 1}` };
}
