export const WORKFLOW_JOB_TYPES = [
  'GENERATE_PROJECT_SCENES',
  'RETRY_SCENE',
  'VERIFY_SINGLE_SCENE',
  'ASSEMBLE_PROJECT',
  'MATCH_INGEST_PROBE',
  'MATCH_ANALYZE_ROSTER',
  'MATCH_ANALYZE_TIMELINE',
  'MATCH_ANALYZE_AUDIO',
  'MATCH_CORRELATE_EVENTS',
  'MATCH_GENERATE_COMMENTARY',
  'MATCH_SYNTHESIZE_VOICE',
  'MATCH_BUILD_EDL',
  'MATCH_RENDER_FULL',
  'MATCH_RENDER_SHORTS',
  'MATCH_QUALITY_CHECK',
  'KB_AUTONOMOUS_SYNC',
  'KB_PATCH_MONITOR',
] as const;

export type WorkflowJobType = (typeof WORKFLOW_JOB_TYPES)[number];

export const WORKFLOW_JOB_STATES = [
  'queued',
  'leased',
  'completed',
  'failed',
  'cancelled',
] as const;

export type WorkflowJobState = (typeof WORKFLOW_JOB_STATES)[number];

export type WorkflowJobRecord = {
  id: string;
  projectId: string;
  userId: string;
  jobType: WorkflowJobType;
  state: WorkflowJobState;
  idempotencyKey: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attempts: number;
  lastError?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type EnqueueJobInput = {
  projectId: string;
  userId: string;
  jobType: WorkflowJobType;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
};

export interface JobQueue {
  enqueue(input: EnqueueJobInput): Promise<WorkflowJobRecord>;
  claim(workerId: string, leaseSeconds: number): Promise<WorkflowJobRecord | null>;
  heartbeat(jobId: string, workerId: string, leaseSeconds: number): Promise<void>;
  complete(jobId: string, workerId: string): Promise<void>;
  fail(jobId: string, workerId: string, error: string): Promise<void>;
  cancel(jobId: string, actorId: string, reason?: string): Promise<void>;
  getById(jobId: string): Promise<WorkflowJobRecord | null>;
  listByProject(projectId: string): Promise<WorkflowJobRecord[]>;
}
