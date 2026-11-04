import { readFlowLiveGateEnv } from './flow-live-gates.js';
import { isRecipeVerified } from './flow-ui-recipe.js';
import { loadFlowUiRecipeFromEnv } from './load-recipe.js';

/**
 * Web-safe Flow status helper — no Playwright imports.
 */
export function describeFlowProviderStatus(env: NodeJS.ProcessEnv = process.env): {
  provider: string;
  liveEnabled: boolean;
  uiVerifiedFlag: boolean;
  recipeVerified: boolean;
  gatesOk: boolean;
  gateReasons: string[];
  profileConfigured: boolean;
} {
  const recipe = loadFlowUiRecipeFromEnv(env);
  const recipeVerified = isRecipeVerified(recipe);
  const gates = readFlowLiveGateEnv(env, recipeVerified);
  return {
    provider: (env.FLOW_PROVIDER ?? 'mock').toLowerCase(),
    liveEnabled: env.FLOW_LIVE_ENABLED === 'true',
    uiVerifiedFlag: env.FLOW_UI_VERIFIED === 'true',
    recipeVerified,
    gatesOk: gates.ok,
    gateReasons: gates.ok ? [] : gates.reasons,
    profileConfigured: Boolean(env.FLOW_BROWSER_PROFILE_DIR?.trim()),
  };
}
