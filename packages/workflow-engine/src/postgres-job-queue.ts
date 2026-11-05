import { randomUUID } from 'node:crypto';
import type {
  EnqueueJobInput,
  JobQueue,
  WorkflowJobRecord,
  WorkflowJobState,
  WorkflowJobType,
} from './job-types.js';

/**
 * Minimal Postgres-backed job queue using a injectable query function.
 * Maps to public.workflow_jobs. Prefer service-role credentials for lease updates.
 *
 * For local/dev without Postgres, use MemoryJobQueue or FileJobQueue instead.
 */
export type PostgresJobQueueClient = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

function mapRow(row: Record<string, unknown>): WorkflowJobRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(
      row.user_id ?? ((row.payload as { userId?: string } | undefined)?.userId ?? ''),
    ),
    jobType: row.job_type as WorkflowJobType,
    state: row.state as WorkflowJobState,
    idempotencyKey: String(row.idempotency_key),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : undefined,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : undefined,
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : undefined,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class PostgresJobQueue implements JobQueue {
  constructor(private readonly client: PostgresJobQueueClient) {}

  async enqueue(input: EnqueueJobInput): Promise<WorkflowJobRecord> {
    const existing = await this.client.query<Record<string, unknown>>(
      `select * from public.workflow_jobs where idempotency_key = $1 limit 1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) return mapRow(existing.rows[0]);

    const id = randomUUID();
    const payload = { ...input.payload, userId: input.userId };
    const inserted = await this.client.query<Record<string, unknown>>(
      `insert into public.workflow_jobs
        (id, project_id, job_type, state, idempotency_key, attempts, payload)
       values ($1, $2, $3, 'queued', $4, 0, $5::jsonb)
       returning *`,
      [id, input.projectId, input.jobType, input.idempotencyKey, JSON.stringify(payload)],
    );
    return mapRow(inserted.rows[0]!);
  }

  async claim(workerId: string, leaseSeconds: number): Promise<WorkflowJobRecord | null> {
    const claimed = await this.client.query<Record<string, unknown>>(
      `with next as (
         select id from public.workflow_jobs
         where state = 'queued'
            or (state = 'leased' and lease_expires_at <= now())
         order by created_at asc
         for update skip locked
         limit 1
       )
       update public.workflow_jobs j
       set state = 'leased',
           lease_owner = $1,
           lease_expires_at = now() + ($2 || ' seconds')::interval,
           attempts = j.attempts + 1,
           updated_at = now()
       from next
       where j.id = next.id
       returning j.*`,
      [workerId, String(leaseSeconds)],
    );
    const row = claimed.rows[0];
    return row ? mapRow(row) : null;
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds: number): Promise<void> {
    await this.client.query(
      `update public.workflow_jobs
       set lease_expires_at = now() + ($3 || ' seconds')::interval, updated_at = now()
       where id = $1 and lease_owner = $2 and state = 'leased'`,
      [jobId, workerId, String(leaseSeconds)],
    );
  }

  async complete(jobId: string, workerId: string): Promise<void> {
    await this.client.query(
      `update public.workflow_jobs
       set state = 'completed', lease_owner = null, lease_expires_at = null, updated_at = now()
       where id = $1 and lease_owner = $2 and state = 'leased'`,
      [jobId, workerId],
    );
  }

  async fail(jobId: string, workerId: string, error: string): Promise<void> {
    await this.client.query(
      `update public.workflow_jobs
       set state = 'failed', last_error = $3, lease_owner = null, lease_expires_at = null, updated_at = now()
       where id = $1 and lease_owner = $2 and state = 'leased'`,
      [jobId, workerId, error],
    );
  }

  async cancel(jobId: string, _actorId: string, reason?: string): Promise<void> {
    await this.client.query(
      `update public.workflow_jobs
       set state = 'cancelled',
           last_error = coalesce($2, last_error),
           lease_owner = null,
           lease_expires_at = null,
           updated_at = now()
       where id = $1 and state in ('queued', 'leased', 'failed')`,
      [jobId, reason ?? null],
    );
  }

  async getById(jobId: string): Promise<WorkflowJobRecord | null> {
    const result = await this.client.query<Record<string, unknown>>(
      `select * from public.workflow_jobs where id = $1`,
      [jobId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listByProject(projectId: string): Promise<WorkflowJobRecord[]> {
    const result = await this.client.query<Record<string, unknown>>(
      `select * from public.workflow_jobs where project_id = $1 order by created_at desc`,
      [projectId],
    );
    return result.rows.map(mapRow);
  }
}
