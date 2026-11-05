import { describe, expect, it } from 'vitest';
import { createJobQueue } from './create-job-queue.js';
import { MemoryJobQueue } from './memory-job-queue.js';
import { FileJobQueue } from './file-job-queue.js';
import { PostgresJobQueue } from './postgres-job-queue.js';

describe('createJobQueue', () => {
  it('creates memory and file queues', () => {
    expect(createJobQueue({ env: { MATCH_JOB_QUEUE: 'memory' } })).toBeInstanceOf(MemoryJobQueue);
    expect(
      createJobQueue({
        env: { MATCH_JOB_QUEUE: 'file' },
        filePath: 'D:/tmp/asf-test-queue.json',
      }),
    ).toBeInstanceOf(FileJobQueue);
  });

  it('requires sql client for postgres mode', () => {
    expect(() => createJobQueue({ env: { MATCH_JOB_QUEUE: 'postgres' } })).toThrow(/SQL client/);
    const queue = createJobQueue({
      env: { MATCH_JOB_QUEUE: 'postgres' },
      sqlClient: { query: async () => ({ rows: [] }) },
    });
    expect(queue).toBeInstanceOf(PostgresJobQueue);
  });
});
