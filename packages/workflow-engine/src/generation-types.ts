import {
  BUSINESS_DEFAULTS,
  type AssetOrigin,
  type SceneState,
  type WorkflowState,
} from '@ai-shorts-factory/shared-types';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';

export type SceneAssetMetadata = {
  bytes: number;
  sha256: string;
  contentType: string;
  durationSeconds?: number;
  width?: number | null;
  height?: number | null;
  hasVideo?: boolean;
  hasAudio?: boolean;
  videoCodec?: string | null;
  audioCodec?: string | null;
  formatName?: string | null;
  aspectRatio?: number;
  probedAt?: string;
  originalDownloadPreserved?: boolean;
  importOperationId?: string;
};

export type GenerationSceneRecord = {
  id: string;
  projectId: string;
  sceneNumber: number;
  title: string;
  state: SceneState;
  durationSeconds: number;
  flowPrompt: string;
  generationJobId?: string;
  submissionId?: string;
  reservationId?: string;
  /** Persisted before Flow Generate is clicked — used for crash reconciliation. */
  idempotencyKey?: string;
  submissionAttempted?: boolean;
  assetStorageKey?: string;
  assetChecksum?: string;
  assetOrigin?: AssetOrigin;
  assetMetadata?: SceneAssetMetadata;
  errorMessage?: string;
  /** Estimated Flow credit cost for this scene (never treated as confirmed). */
  estimatedCreditCost?: number | 'unknown';
  /** Operator-confirmed actual spend after checking the Google Flow account. */
  confirmedCreditCost?: number | 'unknown';
  creditReconciliationNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationProjectSnapshot = {
  projectId: string;
  userId: string;
  workflowState: WorkflowState;
  screenplay: ScreenplayV1;
  scenes: GenerationSceneRecord[];
};

/**
 * Persistence ports used by the sequential generation runner.
 * Implemented by memory/supabase adapters in the app layer.
 */
export interface GenerationStore {
  getProjectSnapshot(userId: string, projectId: string): Promise<GenerationProjectSnapshot>;
  ensureScenesFromScreenplay(
    userId: string,
    projectId: string,
    screenplay: ScreenplayV1,
  ): Promise<GenerationSceneRecord[]>;
  updateScene(
    userId: string,
    projectId: string,
    sceneId: string,
    patch: Partial<GenerationSceneRecord>,
  ): Promise<GenerationSceneRecord>;
  setProjectWorkflowState(userId: string, projectId: string, state: WorkflowState): Promise<void>;
}

export type DownloadedAssetVerification = {
  ok: true;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  hasVideo: true;
} | {
  ok: false;
  reason: string;
};

export type GenerationRunnerOptions = {
  workerId: string;
  model?: string;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
  /** Local image paths attached as Flow Ingredients for character consistency. */
  referenceAssetPaths?: string[];
  estimatedCostPerScene?: number;
  /** Phase 4/7 single-scene live verification / canary — process at most N pending scenes. */
  maxScenes?: number;
  /** Mark completed assets as mock or real. */
  assetOrigin?: AssetOrigin;
  /**
   * Live spend must be explicitly confirmed. When true, runner refuses without
   * `spendConfirmationAccepted: true` from the operator preflight step.
   */
  requireSpendConfirmation?: boolean;
  spendConfirmationAccepted?: boolean;
  /**
   * Required to retry UNKNOWN_SUBMISSION after human credit reconciliation.
   * Spend confirmation alone is not enough.
   */
  unknownSubmissionReconciled?: boolean;
  /**
   * Unlock sequential multi-scene live generation. Without this, any live /
   * spend-confirmed run is hard-capped at one scene (canary lock).
   */
  allowFullLiveProject?: boolean;
  /** Optional FFprobe (or equivalent) verification for real downloads. */
  verifyDownloadedAsset?: (localPath: string) => Promise<DownloadedAssetVerification>;
  /** Injected failures for tests — never used against live Flow. */
  failOnSceneNumber?: number;
  failMode?: 'before_submit' | 'after_submit_uncertain' | 'download' | 'verification';
};

/** Live / spend-gated runs default to one scene until explicitly unlocked. */
export function resolveEffectiveMaxScenes(options: GenerationRunnerOptions): number | undefined {
  const isLive =
    options.assetOrigin === 'REAL_GENERATED' || options.requireSpendConfirmation === true;
  if (!isLive) {
    return options.maxScenes;
  }
  if (options.allowFullLiveProject) {
    return options.maxScenes ?? BUSINESS_DEFAULTS.sceneCount;
  }
  const requested = options.maxScenes ?? 1;
  return Math.min(1, requested);
}
