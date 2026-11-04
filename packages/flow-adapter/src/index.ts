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
  VideoGenerationProvider,
} from './provider.js';

export type {
  FlowBrowserSession,
  FlowBrowserSessionFactory,
  FlowBrowserSessionOptions,
} from './browser-session.js';
export type { FlowUiRecipe, FlowUiSelectors } from './flow-ui-recipe.js';
export type { FlowLiveGateInput, FlowLiveGateResult } from './flow-live-gates.js';

export { MockVideoGenerationProvider } from './mock-provider.js';
export {
  createUnverifiedFlowUiRecipe,
  assertRecipeShape,
  listMissingSelectors,
  isRecipeVerified,
  REQUIRED_SELECTOR_KEYS,
} from './flow-ui-recipe.js';
export { evaluateFlowLiveGates, readFlowLiveGateEnv } from './flow-live-gates.js';
export { loadFlowUiRecipeFromFile, loadFlowUiRecipeFromEnv } from './load-recipe.js';
export { describeFlowProviderStatus } from './flow-status.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'VideoGenerationProvider with mock and gated Playwright Google Flow provider',
    liveProviderReady: false,
    liveRequiresUiVerification: true,
    liveImportPath: '@ai-shorts-factory/flow-adapter/live',
  } as const;
}
