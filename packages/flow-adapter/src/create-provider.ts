import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { FlowBrowserSessionFactory } from './browser-session.js';
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
 * Factory: defaults to mock. Playwright only when FLOW_PROVIDER=playwright and gates pass
 * at construction time for availability messaging (provider still re-checks on use).
 */
export function createVideoGenerationProvider(
  options: CreateProviderOptions = {},
): VideoGenerationProvider {
  const env = options.env ?? process.env;
  const providerName = (env.FLOW_PROVIDER ?? 'mock').toLowerCase();

  if (providerName === 'mock' || providerName === '') {
    return new MockVideoGenerationProvider({
      costPerGeneration:
        Number(env.DEFAULT_COST_PER_SCENE) || BUSINESS_DEFAULTS.estimatedCostPerScene,
    });
  }

  if (providerName !== 'playwright' && providerName !== 'google-flow') {
    throw new Error(
      `Unsupported FLOW_PROVIDER=${providerName}. Use mock (default) or playwright after UI verification.`,
    );
  }

  const recipe = options.recipe ?? loadFlowUiRecipeFromEnv(env);
  const gates = readFlowLiveGateEnv(env, isRecipeVerified(recipe));

  // Always construct the Playwright provider so callers can surface gate errors via
  // validateConfiguration / checkAvailability. Never silently fall back to mock when
  // the operator explicitly requested playwright.
  void gates;

  return new GoogleFlowPlaywrightProvider({
    recipe,
    profileDir: env.FLOW_BROWSER_PROFILE_DIR ?? '',
    diagnosticDir: env.FLOW_DIAGNOSTIC_SCREENSHOT_DIR ?? './diagnostic-screenshots',
    headless: env.FLOW_HEADLESS !== 'false',
    liveEnabled: env.FLOW_LIVE_ENABLED === 'true',
    uiVerifiedFlag: env.FLOW_UI_VERIFIED === 'true',
    nodeEnv: env.NODE_ENV,
    ci: env.CI,
    sessionFactory: options.sessionFactory,
  });
}
