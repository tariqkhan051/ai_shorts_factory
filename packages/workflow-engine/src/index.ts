/**
 * Package: @ai-shorts-factory/workflow-engine
 * Durable workflow state machine and PostgreSQL-backed job queue
 *
 * Phase 0: scaffold only. Real implementation lands in later phases.
 * Do not treat this package as production-ready.
 */
export const PACKAGE_NAME = '@ai-shorts-factory/workflow-engine' as const;
export const PACKAGE_PHASE = 0 as const;
export const PACKAGE_STATUS = 'scaffold' as const;

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'Durable workflow state machine and PostgreSQL-backed job queue',
  } as const;
}
