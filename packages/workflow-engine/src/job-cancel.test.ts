import { describe, expect, it } from 'vitest';
import { MemoryJobQueue } from './memory-job-queue.js';

describe('JobQueue.cancel', () => {
  it('cancels queued jobs and prevents claim', async () => {
    const queue = new MemoryJobQueue();
    const job = await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'MATCH_INGEST_PROBE',
      idempotencyKey: 'cancel-1',
    });
    await queue.cancel(job.id, 'u1', 'user cancelled');
    const stored = await queue.getById(job.id);
    expect(stored?.state).toBe('cancelled');
    expect(await queue.claim('worker-a', 30)).toBeNull();
  });
});
