import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { FlowBrowserSessionFactory } from './browser-session.js';
import { readFlowLiveConfig, resolveFlowModelOptionLabel } from './flow-live-config.js';
import { readFlowLiveGateEnv } from './flow-live-gates.js';
import { isRecipeVerified, type FlowUiRecipe } from './flow-ui-recipe.js';
import { GoogleFlowPlaywrightProvider } from './google-flow-playwright-provider.js';
import { loadFlowUiRecipeFromEnv } from './load-recipe.js';
import { MockVideoGenerationProvider } from './mock-provider.js';
import type { VideoGenerationProvider } from './provider.js';

export type CreateProviderOptions = {
  env?: NodeJS.ProcessEnv;
  recipe?: FlowUiRecipe;
  sessionFactory?: FlowBrowserSessionFactory;
};

/**
 * Factory: defaults to mock. Playwright / google-flow only when explicitly selected.
 * Provider still re-checks live gates on use. Never silently falls back to mock when
 * the operator requested a live provider name.
 */
export function createVideoGenerationProvider(
  options: CreateProviderOptions = {},
): VideoGenerationProvider {
  const env = options.env ?? process.env;
  const providerName = (env.FLOW_PROVIDER ?? 'mock').toLowerCase();
  const liveConfig = readFlowLiveConfig(env);

  if (providerName === 'mock' || providerName === '') {
    return new MockVideoGenerationProvider({
      costPerGeneration:
        Number(env.DEFAULT_COST_PER_SCENE) || BUSINESS_DEFAULTS.estimatedCostPerScene,
    });
  }

  if (providerName !== 'playwright' && providerName !== 'google-flow') {
    throw new Error(
      `Unsupported FLOW_PROVIDER=${providerName}. Use mock (default), playwright, or google-flow after UI verification.`,
    );
  }

  // Hard refuse constructing a live provider in CI / test — never risk credit spend.
  const ci = (env.CI ?? '').toLowerCase() === 'true' || env.CI === '1';
  if (ci || env.NODE_ENV === 'test') {
    throw new Error(
      `Refusing live FLOW_PROVIDER=${providerName} under CI/test. Use FLOW_PROVIDER=mock.`,
    );
  }

  const recipe = options.recipe ?? loadFlowUiRecipeFromEnv(env);
  if (liveConfig.baseUrl.trim() && !recipe.baseUrl.trim()) {
    recipe.baseUrl = liveConfig.baseUrl;
  }
  // Model is operator-configurable: env wins over recipe file for future model switches.
  recipe.modelOptionLabel = resolveFlowModelOptionLabel(env, recipe.modelOptionLabel);
  if (liveConfig.aspectRatio && !recipe.aspectRatioOptionLabel) {
    recipe.aspectRatioOptionLabel = liveConfig.aspectRatio;
  }

  const gates = readFlowLiveGateEnv(env, isRecipeVerified(recipe));
  void gates;

  return new GoogleFlowPlaywrightProvider({
    recipe,
    profileDir: liveConfig.browserProfileDir,
    diagnosticDir: liveConfig.diagnosticDir,
    headless: liveConfig.headless,
    liveEnabled: liveConfig.liveEnabled,
    uiVerifiedFlag: liveConfig.uiVerified,
    nodeEnv: env.NODE_ENV,
    ci: env.CI,
    sessionFactory: options.sessionFactory,
    pollIntervalMs: liveConfig.pollIntervalMs,
    completionTimeoutMs: liveConfig.generationTimeoutMs,
    requireExactModelMatch: env.FLOW_REQUIRE_EXACT_OPTIONS !== 'false',
  });
}
