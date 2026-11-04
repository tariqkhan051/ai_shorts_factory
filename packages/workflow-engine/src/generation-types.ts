import type { SceneState, WorkflowState } from '@ai-shorts-factory/shared-types';
import type { ScreenplayV1 } from '@ai-shorts-factory/validation';

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
  assetStorageKey?: string;
  assetChecksum?: string;
  errorMessage?: string;
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

export type GenerationRunnerOptions = {
  workerId: string;
  model?: string;
  durationSeconds?: number;
  resolution?: string;
  estimatedCostPerScene?: number;
  /** Phase 4 single-scene live verification — process at most N pending scenes. */
  maxScenes?: number;
  /** Injected failures for tests — never used against live Flow. */
  failOnSceneNumber?: number;
  failMode?: 'before_submit' | 'after_submit_uncertain' | 'download';
};
