import { describeFlowProviderStatus } from '@ai-shorts-factory/flow-adapter/status';
import type { CreditBalances } from '@ai-shorts-factory/credit-manager';
import type { GenerationSceneRecord } from '@ai-shorts-factory/workflow-engine';

export type FlowIntegrationSnapshot = {
  providerLabel: 'Mock' | 'Google Flow';
  sessionStatus: string;
  sessionMessage: string;
  selectedModel: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  canaryOnly: boolean;
  maxLiveScenesPerProject: number;
  availableBudget: number;
  reserved: number;
  confirmedSpent: number;
  estimatedSpent: number;
  unknownConsumption: number;
  liveGenerationStatus: string;
  currentScene: string;
  gatesOk: boolean;
  gateReasons: string[];
  history: Array<{
    sceneNumber: number;
    state: string;
    assetOrigin?: string;
    submissionId?: string;
    errorMessage?: string;
  }>;
};

export function buildFlowIntegrationSnapshot(input: {
  credits: CreditBalances;
  scenes: GenerationSceneRecord[];
  env?: NodeJS.ProcessEnv;
}): FlowIntegrationSnapshot {
  const flow = describeFlowProviderStatus(input.env ?? process.env);
  const providerLabel =
    flow.provider === 'google-flow' || flow.provider === 'playwright' ? 'Google Flow' : 'Mock';

  const active = input.scenes.find((scene) =>
    ['GENERATING', 'SUBMITTING', 'DOWNLOADING', 'VERIFYING'].includes(scene.state),
  );
  const completedLive = input.scenes.filter(
    (scene) => scene.state === 'COMPLETED' && scene.assetOrigin === 'REAL_GENERATED',
  ).length;

  return {
    providerLabel,
    sessionStatus: flow.session.status,
    sessionMessage: flow.session.message,
    selectedModel: flow.model,
    aspectRatio: flow.aspectRatio,
    resolution: flow.resolution,
    durationSeconds: flow.durationSeconds,
    canaryOnly: flow.canaryOnly,
    maxLiveScenesPerProject: flow.maxLiveScenesPerProject,
    availableBudget: input.credits.spendable,
    reserved: input.credits.reserved,
    confirmedSpent: input.credits.confirmedSpent,
    estimatedSpent: completedLive * (typeof flow.estimatedCostPerScene === 'number'
      ? flow.estimatedCostPerScene
      : 0),
    unknownConsumption: input.credits.unknownConsumption,
    liveGenerationStatus: active
      ? active.state
      : flow.liveEnabled
        ? flow.session.status
        : 'MOCK',
    currentScene: active
      ? `Scene ${active.sceneNumber}`
      : input.scenes.find((scene) => scene.state !== 'COMPLETED')
        ? `Scene ${input.scenes.find((scene) => scene.state !== 'COMPLETED')!.sceneNumber}`
        : '—',
    gatesOk: flow.gatesOk,
    gateReasons: flow.gateReasons,
    history: input.scenes
      .slice()
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((scene) => ({
        sceneNumber: scene.sceneNumber,
        state: scene.state,
        assetOrigin: scene.assetOrigin,
        submissionId: scene.submissionId,
        errorMessage: scene.errorMessage,
      })),
  };
}
