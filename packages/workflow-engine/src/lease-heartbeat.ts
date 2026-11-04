import type { JobQueue } from './job-types.js';

/**
 * Keeps a claimed job lease alive while a long-running handler executes.
 * Callers must always stop the interval (try/finally) so leases expire after crashes.
 */
export function startLeaseHeartbeat(
  queue: JobQueue,
  jobId: string,
  workerId: string,
  leaseSeconds: number,
  intervalMs = Math.max(1_000, Math.floor((leaseSeconds * 1000) / 3)),
): { stop: () => void } {
  const timer = setInterval(() => {
    void queue.heartbeat(jobId, workerId, leaseSeconds).catch(() => {
      // Heartbeat failures surface on the next claim/complete path.
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
  };
}
