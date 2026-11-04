import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryJobQueue } from './memory-job-queue.js';
import { startLeaseHeartbeat } from './lease-heartbeat.js';
import { nextJobIdempotencyKey } from './idempotency-keys.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('worker restart and lease reclaim', () => {
  const queue = new MemoryJobQueue();

  beforeEach(() => {
    queue.clear();
  });

  it('allows a second worker to reclaim an expired lease after a crash', async () => {
    await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'GENERATE_PROJECT_SCENES',
      idempotencyKey: 'gen:p1:attempt:1',
    });

    const first = await queue.claim('worker-a', 1);
    expect(first?.leaseOwner).toBe('worker-a');

    // Simulate crash: worker-a never heartbeats or completes.
    await sleep(1100);

    const reclaimed = await queue.claim('worker-b', 30);
    expect(reclaimed?.id).toBe(first?.id);
    expect(reclaimed?.leaseOwner).toBe('worker-b');
    expect(reclaimed?.attempts).toBe(2);

    await queue.complete(reclaimed!.id, 'worker-b');
    const done = await queue.getById(reclaimed!.id);
    expect(done?.state).toBe('completed');
  });

  it('extends the lease via heartbeat so another worker cannot steal the job', async () => {
    await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'ASSEMBLE_PROJECT',
      idempotencyKey: 'assemble:p1:attempt:1',
    });

    const claimed = await queue.claim('worker-a', 1);
    expect(claimed).not.toBeNull();
    const heartbeat = startLeaseHeartbeat(queue, claimed!.id, 'worker-a', 2, 200);

    try {
      await sleep(1500);
      const other = await queue.claim('worker-b', 30);
      expect(other).toBeNull();
      await queue.complete(claimed!.id, 'worker-a');
    } finally {
      heartbeat.stop();
    }
  });

  it('reuses the active idempotency key on double-submit and advances after terminal', async () => {
    const firstKey = await nextJobIdempotencyKey(
      queue,
      'p1',
      'GENERATE_PROJECT_SCENES',
      'generate:p1',
    );
    expect(firstKey.idempotencyKey).toBe('generate:p1:attempt:1');

    const job = await queue.enqueue({
      projectId: 'p1',
      userId: 'u1',
      jobType: 'GENERATE_PROJECT_SCENES',
      idempotencyKey: firstKey.idempotencyKey,
    });

    const double = await nextJobIdempotencyKey(
      queue,
      'p1',
      'GENERATE_PROJECT_SCENES',
      'generate:p1',
    );
    expect(double.existing?.id).toBe(job.id);
    expect(double.idempotencyKey).toBe(job.idempotencyKey);

    const claimed = await queue.claim('worker-a', 30);
    await queue.fail(claimed!.id, 'worker-a', 'boom');

    const next = await nextJobIdempotencyKey(queue, 'p1', 'GENERATE_PROJECT_SCENES', 'generate:p1');
    expect(next.idempotencyKey).toBe('generate:p1:attempt:2');
  });
});
