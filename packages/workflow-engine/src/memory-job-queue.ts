import { randomUUID } from 'node:crypto';
import type { EnqueueJobInput, JobQueue, WorkflowJobRecord } from './job-types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

export class MemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, WorkflowJobRecord>();
  private readonly idempotency = new Map<string, string>();

  async enqueue(input: EnqueueJobInput): Promise<WorkflowJobRecord> {
    const existingId = this.idempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (!existing) {
        throw new Error('Idempotent job missing');
      }
      return structuredClone(existing);
    }

    const timestamp = nowIso();
    const job: WorkflowJobRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      userId: input.userId,
      jobType: input.jobType,
      state: 'queued',
      idempotencyKey: input.idempotencyKey,
      attempts: 0,
      payload: input.payload ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.jobs.set(job.id, job);
    this.idempotency.set(input.idempotencyKey, job.id);
    return structuredClone(job);
  }

  async claim(workerId: string, leaseSeconds: number): Promise<WorkflowJobRecord | null> {
    const candidates = [...this.jobs.values()]
      .filter((job) => {
        if (job.state === 'queued') return true;
        if (job.state === 'leased' && job.leaseExpiresAt) {
          return Date.parse(job.leaseExpiresAt) <= nowMs();
        }
        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const job = candidates[0];
    if (!job) return null;

    const updated: WorkflowJobRecord = {
      ...job,
      state: 'leased',
      leaseOwner: workerId,
      leaseExpiresAt: new Date(nowMs() + leaseSeconds * 1000).toISOString(),
      attempts: job.attempts + 1,
      updatedAt: nowIso(),
    };
    this.jobs.set(job.id, updated);
    return structuredClone(updated);
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds: number): Promise<void> {
    const job = this.requireOwned(jobId, workerId);
    this.jobs.set(jobId, {
      ...job,
      leaseExpiresAt: new Date(nowMs() + leaseSeconds * 1000).toISOString(),
      updatedAt: nowIso(),
    });
  }

  async complete(jobId: string, workerId: string): Promise<void> {
    const job = this.requireOwned(jobId, workerId);
    this.jobs.set(jobId, {
      ...job,
      state: 'completed',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowIso(),
    });
  }

  async fail(jobId: string, workerId: string, error: string): Promise<void> {
    const job = this.requireOwned(jobId, workerId);
    this.jobs.set(jobId, {
      ...job,
      state: 'failed',
      lastError: error,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowIso(),
    });
  }

  async cancel(jobId: string, _actorId: string, reason?: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.state === 'completed' || job.state === 'cancelled') {
      return;
    }
    this.jobs.set(jobId, {
      ...job,
      state: 'cancelled',
      lastError: reason ?? job.lastError,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowIso(),
    });
  }

  async getById(jobId: string): Promise<WorkflowJobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : null;
  }

  async listByProject(projectId: string): Promise<WorkflowJobRecord[]> {
    return [...this.jobs.values()]
      .filter((job) => job.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((job) => structuredClone(job));
  }

  clear(): void {
    this.jobs.clear();
    this.idempotency.clear();
  }

  exportAll(): WorkflowJobRecord[] {
    return [...this.jobs.values()].map((j) => structuredClone(j));
  }

  importAll(jobs: WorkflowJobRecord[]): void {
    this.clear();
    for (const job of jobs) {
      this.jobs.set(job.id, structuredClone(job));
      this.idempotency.set(job.idempotencyKey, job.id);
    }
  }

  private requireOwned(jobId: string, workerId: string): WorkflowJobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    if (job.state !== 'leased' || job.leaseOwner !== workerId) {
      throw new Error(`Job ${jobId} is not leased by ${workerId}`);
    }
    return job;
  }
}
