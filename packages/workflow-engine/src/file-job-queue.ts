import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EnqueueJobInput, JobQueue, WorkflowJobRecord } from './job-types.js';
import { MemoryJobQueue } from './memory-job-queue.js';

/**
 * Durable process-local queue persisted to JSON.
 * Useful when Postgres is unavailable but Match Studio jobs must survive restarts.
 * Production should prefer PostgresJobQueue.
 */
export class FileJobQueue implements JobQueue {
  private readonly memory = new MemoryJobQueue();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as { jobs?: WorkflowJobRecord[] };
      this.memory.importAll(parsed.jobs ?? []);
    } catch {
      // missing file is fine
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify({ jobs: this.memory.exportAll() }, null, 2),
      'utf8',
    );
  }

  async enqueue(input: EnqueueJobInput): Promise<WorkflowJobRecord> {
    await this.ensureLoaded();
    const job = await this.memory.enqueue(input);
    await this.persist();
    return job;
  }

  async claim(workerId: string, leaseSeconds: number): Promise<WorkflowJobRecord | null> {
    await this.ensureLoaded();
    const job = await this.memory.claim(workerId, leaseSeconds);
    await this.persist();
    return job;
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds: number): Promise<void> {
    await this.ensureLoaded();
    await this.memory.heartbeat(jobId, workerId, leaseSeconds);
    await this.persist();
  }

  async complete(jobId: string, workerId: string): Promise<void> {
    await this.ensureLoaded();
    await this.memory.complete(jobId, workerId);
    await this.persist();
  }

  async fail(jobId: string, workerId: string, error: string): Promise<void> {
    await this.ensureLoaded();
    await this.memory.fail(jobId, workerId, error);
    await this.persist();
  }

  async cancel(jobId: string, actorId: string, reason?: string): Promise<void> {
    await this.ensureLoaded();
    await this.memory.cancel(jobId, actorId, reason);
    await this.persist();
  }

  async getById(jobId: string): Promise<WorkflowJobRecord | null> {
    await this.ensureLoaded();
    return this.memory.getById(jobId);
  }

  async listByProject(projectId: string): Promise<WorkflowJobRecord[]> {
    await this.ensureLoaded();
    return this.memory.listByProject(projectId);
  }
}
