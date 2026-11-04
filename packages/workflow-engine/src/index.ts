/**
 * Package: @ai-shorts-factory/workflow-engine
 * Job queue + sequential scene generation runner.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/workflow-engine' as const;
export const PACKAGE_PHASE = 3 as const;
export const PACKAGE_STATUS = 'active' as const;

export type {
  WorkflowJobType,
  WorkflowJobState,
  WorkflowJobRecord,
  EnqueueJobInput,
  JobQueue,
} from './job-types.js';
export { WORKFLOW_JOB_TYPES, WORKFLOW_JOB_STATES } from './job-types.js';
export { MemoryJobQueue } from './memory-job-queue.js';
export { startLeaseHeartbeat } from './lease-heartbeat.js';
export { nextJobIdempotencyKey } from './idempotency-keys.js';

export type {
  GenerationSceneRecord,
  GenerationProjectSnapshot,
  GenerationStore,
  GenerationRunnerOptions,
} from './generation-types.js';
export type { SceneGenerationResult } from './sequential-generation-runner.js';
export { SequentialGenerationRunner } from './sequential-generation-runner.js';
export { MemoryGenerationStore } from './memory-generation-store.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Workflow state machine, job queue leases, and sequential generation',
  } as const;
}
