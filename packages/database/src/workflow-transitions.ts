import type { WorkflowState } from '@ai-shorts-factory/shared-types';

/**
 * Legal project workflow transitions (Phase 2–5 surface).
 * Expanded for generation + FFmpeg assembly.
 */
const ALLOWED: Partial<Record<WorkflowState, readonly WorkflowState[]>> = {
  IDEA_SUBMITTED: ['STORY_PROMPT_READY', 'WAITING_FOR_CHATGPT', 'STORY_IMPORTED'],
  STORY_PROMPT_READY: ['WAITING_FOR_CHATGPT', 'STORY_IMPORTED'],
  WAITING_FOR_CHATGPT: ['STORY_IMPORTED', 'STORY_PROMPT_READY'],
  STORY_IMPORTED: ['STORY_VALIDATION', 'WAITING_FOR_CHATGPT'],
  STORY_VALIDATION: ['STORY_APPROVAL', 'STORY_IMPORTED', 'WAITING_FOR_CHATGPT'],
  STORY_APPROVAL: [
    'SCENE_PREPARATION',
    'STORY_VALIDATION',
    'WAITING_FOR_CHATGPT',
    'STORY_IMPORTED',
  ],
  SCENE_PREPARATION: [
    'READY_FOR_GENERATION',
    'STORY_APPROVAL',
    'STORY_IMPORTED',
    'WAITING_FOR_CHATGPT',
  ],
  READY_FOR_GENERATION: ['CREDIT_RESERVED', 'PAUSED', 'CANCELLED'],
  CREDIT_RESERVED: ['GENERATING_SCENES', 'PAUSED', 'NEEDS_HUMAN_INTERVENTION'],
  GENERATING_SCENES: ['VERIFYING_SCENES', 'PAUSED', 'FAILED', 'NEEDS_HUMAN_INTERVENTION'],
  VERIFYING_SCENES: ['ASSEMBLY_READY', 'PAUSED', 'FAILED'],
  ASSEMBLY_READY: ['ASSEMBLING', 'PAUSED'],
  ASSEMBLING: ['QUALITY_CHECK', 'PAUSED', 'FAILED'],
  QUALITY_CHECK: ['COMPLETED', 'PAUSED', 'FAILED'],
  COMPLETED: ['FINAL_APPROVAL'],
  FINAL_APPROVAL: ['APPROVED', 'PAUSED'],
  PAUSED: [
    'STORY_PROMPT_READY',
    'WAITING_FOR_CHATGPT',
    'STORY_VALIDATION',
    'STORY_APPROVAL',
    'SCENE_PREPARATION',
    'STORY_IMPORTED',
    'READY_FOR_GENERATION',
    'GENERATING_SCENES',
    'CREDIT_RESERVED',
    'ASSEMBLY_READY',
    'ASSEMBLING',
    'QUALITY_CHECK',
  ],
  NEEDS_HUMAN_INTERVENTION: [
    'READY_FOR_GENERATION',
    'GENERATING_SCENES',
    'PAUSED',
    'WAITING_FOR_CHATGPT',
    'ASSEMBLY_READY',
  ],
  FAILED: ['PAUSED', 'READY_FOR_GENERATION', 'ASSEMBLY_READY'],
  CANCELLED: [],
  APPROVED: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal workflow transition: ${from} -> ${to}`);
  }
}

/** Advance through a chain of states when each hop is legal (or already there). */
export function planTransitionPath(from: WorkflowState, steps: WorkflowState[]): WorkflowState[] {
  let current = from;
  const applied: WorkflowState[] = [];
  for (const step of steps) {
    if (current === step) continue;
    assertTransition(current, step);
    applied.push(step);
    current = step;
  }
  return applied;
}
