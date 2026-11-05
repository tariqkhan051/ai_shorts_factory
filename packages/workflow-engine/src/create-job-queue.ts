import { join } from 'node:path';
import { FileJobQueue } from './file-job-queue.js';
import { MemoryJobQueue } from './memory-job-queue.js';
import { PostgresJobQueue, type PostgresJobQueueClient } from './postgres-job-queue.js';
import type { JobQueue } from './job-types.js';

export type CreateJobQueueOptions = {
  env?: NodeJS.ProcessEnv;
  /**
   * Required when mode is postgres. Typically from createSqlQueryClient().
   */
  sqlClient?: PostgresJobQueueClient;
  filePath?: string;
};

/**
 * Shared factory for Match Studio (and future shared) job queues.
 * Modes: memory | file (default) | postgres
 */
export function createJobQueue(options: CreateJobQueueOptions = {}): JobQueue {
  const env = options.env ?? process.env;
  const mode = (env.MATCH_JOB_QUEUE ?? env.JOB_QUEUE ?? 'file').trim().toLowerCase();

  if (mode === 'memory') {
    return new MemoryJobQueue();
  }

  if (mode === 'postgres') {
    if (!options.sqlClient) {
      throw new Error(
        'MATCH_JOB_QUEUE=postgres requires an injectable SQL client (SUPABASE_DB_URL + createSqlQueryClient).',
      );
    }
    return new PostgresJobQueue(options.sqlClient);
  }

  const path =
    options.filePath ??
    env.ASF_MATCH_JOB_QUEUE_PATH?.trim() ??
    join(process.cwd(), '.data', 'match-job-queue.json');
  return new FileJobQueue(path);
}
