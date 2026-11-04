/**
 * Canonical project workflow states.
 * Legal transitions are enforced by @ai-shorts-factory/workflow-engine (Phase 3+).
 */
export const WORKFLOW_STATES = [
  'IDEA_SUBMITTED',
  'STORY_PROMPT_READY',
  'WAITING_FOR_CHATGPT',
  'STORY_IMPORTED',
  'STORY_VALIDATION',
  'STORY_APPROVAL',
  'SCENE_PREPARATION',
  'READY_FOR_GENERATION',
  'CREDIT_RESERVED',
  'GENERATING_SCENES',
  'VERIFYING_SCENES',
  'ASSEMBLY_READY',
  'ASSEMBLING',
  'QUALITY_CHECK',
  'COMPLETED',
  'FINAL_APPROVAL',
  'APPROVED',
  'PAUSED',
  'FAILED',
  'CANCELLED',
  'NEEDS_HUMAN_INTERVENTION',
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const SCENE_STATES = [
  'PENDING',
  'GENERATING',
  'SUBMITTING',
  'DOWNLOADING',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
  'NEEDS_ATTENTION',
  'UNKNOWN_SUBMISSION',
  'DOWNLOAD_FAILED',
  'VERIFICATION_FAILED',
] as const;

export type SceneState = (typeof SCENE_STATES)[number];

/** Distinguishes mock pipeline bytes from verified live Flow downloads. */
export const ASSET_ORIGINS = ['MOCK', 'REAL_GENERATED'] as const;
export type AssetOrigin = (typeof ASSET_ORIGINS)[number];

/**
 * Operator-facing Google Flow session readiness (dashboard / settings).
 * Never inferred from invented APIs — only from config + permitted UI signals.
 */
export const FLOW_SESSION_STATUSES = [
  'NOT_CONFIGURED',
  'AUTHENTICATION_REQUIRED',
  'READY',
  'SESSION_EXPIRED',
  'HUMAN_INTERVENTION_REQUIRED',
  'ERROR',
] as const;
export type FlowSessionStatus = (typeof FLOW_SESSION_STATUSES)[number];

export const CONTENT_CATEGORIES = [
  'fictional_story',
  'cinematic',
  'anime',
  'educational',
  'documentary',
  'kids_cartoon',
  'gaming',
  'romantic_emotional',
  'other',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const VISUAL_STYLES = [
  'automatic',
  'realistic_cinematic',
  'anime',
  '2d_animation',
  '3d_cartoon',
  'documentary',
  'educational_motion_graphics',
  'custom',
] as const;

export type VisualStyle = (typeof VISUAL_STYLES)[number];
