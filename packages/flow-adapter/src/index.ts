/**
 * Package: @ai-shorts-factory/flow-adapter
 * VideoGenerationProvider interface with mock and (future) Playwright providers.
 *
 * Phase 0: contract + mock provider only.
 * GoogleFlowPlaywrightProvider is intentionally not implemented yet.
 */

export const PACKAGE_NAME = '@ai-shorts-factory/flow-adapter' as const;
export const PACKAGE_PHASE = 0 as const;
export const PACKAGE_STATUS = 'scaffold' as const;

export type {
  ProviderAvailability,
  GenerationSubmission,
  GenerationStatus,
  DownloadedAsset,
  GenerationRequest,
  VideoGenerationProvider,
} from './provider.js';

export { MockVideoGenerationProvider } from './mock-provider.js';

export function getPackageMeta() {
  return {
    name: PACKAGE_NAME,
    phase: PACKAGE_PHASE,
    status: PACKAGE_STATUS,
    description: 'VideoGenerationProvider interface with mock and Playwright providers',
    liveProviderReady: false,
  } as const;
}
