import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryJobQueue } from './memory-job-queue.js';

describe('MemoryJobQueue', () => {
  const queue = new MemoryJobQueue();

  beforeEach(() => {
    queue.clear();
  });

  it('enqueues idempotently and supports claim/complete without duplication', async () => {
    const first = await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'GENERATE_PROJECT_SCENES',
      idempotencyKey: 'gen:p1',
    });
    const second = await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'GENERATE_PROJECT_SCENES',
      idempotencyKey: 'gen:p1',
    });
    expect(second.id).toBe(first.id);

    const claimed = await queue.claim('worker-a', 30);
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.attempts).toBe(1);

    // Second worker should not claim the same active lease.
    const other = await queue.claim('worker-b', 30);
    expect(other).toBeNull();

    await queue.complete(first.id, 'worker-a');
    const done = await queue.getById(first.id);
    expect(done?.state).toBe('completed');
  });

  it('heartbeats extend an active lease', async () => {
    await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'ASSEMBLE_PROJECT',
      idempotencyKey: 'assemble:p1',
    });
    const claimed = await queue.claim('worker-a', 30);
    expect(claimed).not.toBeNull();
    const before = claimed!.leaseExpiresAt!;
    await queue.heartbeat(claimed!.id, 'worker-a', 60);
    const after = await queue.getById(claimed!.id);
    expect(Date.parse(after!.leaseExpiresAt!)).toBeGreaterThan(Date.parse(before));
  });
});
