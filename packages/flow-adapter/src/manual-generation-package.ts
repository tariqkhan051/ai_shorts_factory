import { BUSINESS_DEFAULTS, type SceneState } from '@ai-shorts-factory/shared-types';

/**
 * Human-in-the-loop Google Flow generation package.
 * Prepares operator instructions — never drives Playwright or Google's browser.
 */

export type FlowCharacterReferenceHint = {
  name: string;
  visualIdentity: string;
  clothing?: string;
  appearanceDetails?: string;
  /** Operator hint: which Flow library asset / Ingredients item to select. */
  flowLibraryHint?: string;
  /** Optional local or durable URL for display in the app (not uploaded by automation). */
  previewUrl?: string;
};

export type FlowSceneGenerationTask = {
  projectId: string;
  sceneId?: string;
  sceneNumber: number;
  title: string;
  flowPrompt: string;
  model: string;
  aspectRatio: string;
  durationSeconds: number;
  resolution: string;
  estimatedCreditCost: number | 'unknown';
  confirmedCreditCost?: number | 'unknown';
  characterReferences: FlowCharacterReferenceHint[];
  instructions: string[];
  completionStatus: SceneState;
};

export type FlowGenerationPackage = {
  provider: 'google-flow-manual';
  schemaVersion: '1.0.0';
  createdAt: string;
  projectId: string;
  projectName?: string;
  model: string;
  aspectRatio: string;
  durationSeconds: number;
  resolution: string;
  estimatedCostPerScene: number | 'unknown';
  estimatedProjectCost: number | 'unknown';
  scenes: FlowSceneGenerationTask[];
  operatorNotes: string[];
};

export type BuildFlowGenerationPackageInput = {
  projectId: string;
  projectName?: string;
  scenes: Array<{
    sceneId?: string;
    sceneNumber: number;
    title: string;
    flowPrompt: string;
    durationSeconds?: number;
    completionStatus?: SceneState;
    confirmedCreditCost?: number | 'unknown';
  }>;
  characterReferences?: FlowCharacterReferenceHint[];
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  estimatedCostPerScene?: number | 'unknown';
  createdAt?: string;
};

const MANUAL_INSTRUCTIONS = [
  'Open Google Chrome yourself (not Playwright / not an automation-controlled window).',
  'Open Google Flow and your project.',
  'Select the listed model, aspect ratio, duration, and resolution in Flow Settings.',
  'Ingredients: select the listed character reference from the Flow library (do not re-upload duplicates).',
  'Paste the exact prompt from this package into Flow.',
  'Click Start generation yourself.',
  'When the video is ready, download it from Flow.',
  'Upload the downloaded MP4 into AI Shorts Factory for FFprobe verification.',
  'A scene becomes REAL_GENERATED only after verification succeeds — copying a prompt never marks it generated.',
] as const;

export function buildFlowGenerationPackage(
  input: BuildFlowGenerationPackageInput,
): FlowGenerationPackage {
  const model = input.model?.trim() || BUSINESS_DEFAULTS.defaultGenerationModel;
  const aspectRatio =
    input.aspectRatio?.trim() || BUSINESS_DEFAULTS.defaultGenerationAspectRatio;
  const resolution =
    input.resolution?.trim() || BUSINESS_DEFAULTS.defaultGenerationResolution;
  const defaultDuration =
    input.durationSeconds ?? BUSINESS_DEFAULTS.defaultGenerationDurationSeconds;
  const estimatedCostPerScene =
    input.estimatedCostPerScene ?? BUSINESS_DEFAULTS.estimatedCostPerScene;
  const refs = input.characterReferences ?? [];

  const scenes = input.scenes
    .slice()
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .map((scene): FlowSceneGenerationTask => {
      const durationSeconds = scene.durationSeconds ?? defaultDuration;
      return {
        projectId: input.projectId,
        sceneId: scene.sceneId,
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        flowPrompt: scene.flowPrompt,
        model,
        aspectRatio,
        durationSeconds,
        resolution,
        estimatedCreditCost: estimatedCostPerScene,
        confirmedCreditCost: scene.confirmedCreditCost,
        characterReferences: refs.map((ref) => ({ ...ref })),
        instructions: [...MANUAL_INSTRUCTIONS],
        completionStatus: scene.completionStatus ?? 'PROMPT_READY',
      };
    });

  const estimatedProjectCost =
    typeof estimatedCostPerScene === 'number'
      ? estimatedCostPerScene * scenes.length
      : 'unknown';

  return {
    provider: 'google-flow-manual',
    schemaVersion: '1.0.0',
    createdAt: input.createdAt ?? new Date().toISOString(),
    projectId: input.projectId,
    projectName: input.projectName,
    model,
    aspectRatio,
    durationSeconds: defaultDuration,
    resolution,
    estimatedCostPerScene,
    estimatedProjectCost,
    scenes,
    operatorNotes: [
      'Automated Google Flow generation is disabled by default (unusual-activity / anti-automation).',
      'This package never controls Google Flow and never clicks Generate.',
      'Do not mark a scene generated merely because a prompt was copied.',
    ],
  };
}

export function exportFlowGenerationManifest(pkg: FlowGenerationPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Mock assembly eligibility by state only.
 * COMPLETED never implies real-generation readiness.
 */
export function isMockAssemblyState(state: SceneState): boolean {
  return state === 'COMPLETED';
}

/**
 * Real (human-imported Flow) assembly eligibility by state only.
 * Still requires assetOrigin REAL_GENERATED + durable asset checks at the gate.
 */
export function isRealAssemblyState(state: SceneState): boolean {
  return state === 'REAL_GENERATED' || state === 'READY_FOR_ASSEMBLY';
}

/**
 * @deprecated Prefer isMockAssemblyState / isRealAssemblyState.
 * Kept for UI “any path ready” counts — does NOT mean real provenance.
 */
export function isSceneReadyForAssembly(state: SceneState): boolean {
  return isMockAssemblyState(state) || isRealAssemblyState(state);
}

export function isManualFlowSceneState(state: SceneState): boolean {
  return (
    state === 'PROMPT_READY' ||
    state === 'AWAITING_MANUAL_GENERATION' ||
    state === 'GENERATED_PENDING_UPLOAD' ||
    state === 'UPLOADED_PENDING_VERIFICATION' ||
    state === 'REAL_GENERATED' ||
    state === 'READY_FOR_ASSEMBLY'
  );
}
