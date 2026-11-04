/**
 * Package: @ai-shorts-factory/flow-adapter
 * Web-safe surface: contract, mock provider, recipe/gates/status.
 *
 * Live Playwright provider lives at `@ai-shorts-factory/flow-adapter/live`
 * so Next.js never bundles Chromium automation.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/flow-adapter' as const;
export const PACKAGE_PHASE = 4 as const;
export const PACKAGE_STATUS = 'active' as const;

export type {
  ProviderAvailability,
  GenerationSubmission,
  GenerationStatus,
  DownloadedAsset,
  GenerationRequest,
  FlowUiOptionInventory,
  VideoGenerationProvider,
} from './provider.js';

export type {
  FlowBrowserSession,
  FlowBrowserSessionFactory,
  FlowBrowserSessionOptions,
} from './browser-session.js';
export type { FlowUiRecipe, FlowUiSelectors } from './flow-ui-recipe.js';
export type { FlowLiveGateInput, FlowLiveGateResult } from './flow-live-gates.js';
export type { FlowLiveConfig } from './flow-live-config.js';
export type { FlowSessionStatusReport } from './flow-session-status.js';
export type { LiveSpendConfirmationPayload } from './spend-confirmation.js';

export { MockVideoGenerationProvider } from './mock-provider.js';
export { GoogleFlowManualProvider } from './google-flow-manual-provider.js';
export {
  createUnverifiedFlowUiRecipe,
  assertRecipeShape,
  listMissingSelectors,
  isRecipeVerified,
  REQUIRED_SELECTOR_KEYS,
} from './flow-ui-recipe.js';
export {
  evaluateFlowLiveGates,
  evaluateFlowExecuteGates,
  readFlowLiveGateEnv,
} from './flow-live-gates.js';
export {
  readFlowLiveConfig,
  resolveFlowModelOptionLabel,
  resolveLiveMaxScenes,
  isLiveFlowProviderName,
  isManualFlowProviderName,
} from './flow-live-config.js';
export { describeFlowSessionStatus } from './flow-session-status.js';
export {
  createLiveSpendConfirmation,
  assertLiveSpendConfirmation,
  hashSpendConfirmationToken,
  LIVE_SPEND_CONFIRM_PHRASE,
} from './spend-confirmation.js';
export { loadFlowUiRecipeFromFile, loadFlowUiRecipeFromEnv } from './load-recipe.js';
export { describeFlowProviderStatus } from './flow-status.js';
export {
  buildFlowGenerationPackage,
  exportFlowGenerationManifest,
  isSceneReadyForAssembly,
  isMockAssemblyState,
  isRealAssemblyState,
  isManualFlowSceneState,
  type FlowCharacterReferenceHint,
  type FlowSceneGenerationTask,
  type FlowGenerationPackage,
  type BuildFlowGenerationPackageInput,
} from './manual-generation-package.js';
export {
  canTransitionManualScene,
  assertManualSceneTransition,
} from './manual-scene-transitions.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description:
      'VideoGenerationProvider with mock, google-flow-manual (HITL), and opt-in Playwright Google Flow',
    liveProviderReady: false,
    liveRequiresUiVerification: true,
    liveImportPath: '@ai-shorts-factory/flow-adapter/live',
    canaryMode: true,
    manualProvider: 'google-flow-manual',
    playwrightAutomationDefault: false,
  } as const;
}
