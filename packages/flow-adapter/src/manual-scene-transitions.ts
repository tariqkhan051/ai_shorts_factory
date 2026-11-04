import type { SceneState } from '@ai-shorts-factory/shared-types';

/**
 * Legal transitions for the human-in-the-loop Google Flow path.
 * Copying a prompt never advances past PROMPT_READY / AWAITING_MANUAL_GENERATION.
 */
const MANUAL_ALLOWED: Partial<Record<SceneState, readonly SceneState[]>> = {
  PENDING: ['PROMPT_READY'],
  PROMPT_READY: ['AWAITING_MANUAL_GENERATION', 'GENERATED_PENDING_UPLOAD'],
  AWAITING_MANUAL_GENERATION: [
    'GENERATED_PENDING_UPLOAD',
    'UPLOADED_PENDING_VERIFICATION',
    'PROMPT_READY',
  ],
  GENERATED_PENDING_UPLOAD: ['UPLOADED_PENDING_VERIFICATION', 'AWAITING_MANUAL_GENERATION'],
  UPLOADED_PENDING_VERIFICATION: ['REAL_GENERATED', 'VERIFICATION_FAILED'],
  VERIFICATION_FAILED: [
    'GENERATED_PENDING_UPLOAD',
    'UPLOADED_PENDING_VERIFICATION',
    'AWAITING_MANUAL_GENERATION',
  ],
  REAL_GENERATED: ['READY_FOR_ASSEMBLY'],
  READY_FOR_ASSEMBLY: [],
};

export function canTransitionManualScene(from: SceneState, to: SceneState): boolean {
  if (from === to) return true;
  return MANUAL_ALLOWED[from]?.includes(to) ?? false;
}

export function assertManualSceneTransition(from: SceneState, to: SceneState): void {
  if (!canTransitionManualScene(from, to)) {
    throw new Error(`Illegal manual scene transition: ${from} -> ${to}`);
  }
}
