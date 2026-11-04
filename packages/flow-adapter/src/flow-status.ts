import { readFlowLiveConfig } from './flow-live-config.js';
import { readFlowLiveGateEnv } from './flow-live-gates.js';
import { describeFlowSessionStatus, type FlowSessionStatusReport } from './flow-session-status.js';
import { isRecipeVerified } from './flow-ui-recipe.js';
import { loadFlowUiRecipeFromEnv } from './load-recipe-env.js';

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
  canaryOnly: boolean;
  maxLiveScenesPerProject: number;
  model: string;
  modelOptionLabel: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  maxDailyCreditBudget: number;
  estimatedCostPerScene: number | 'unknown';
  session: FlowSessionStatusReport;
} {
  const recipe = loadFlowUiRecipeFromEnv(env);
  const recipeVerified = isRecipeVerified(recipe);
  const gates = readFlowLiveGateEnv(env, recipeVerified);
  const config = readFlowLiveConfig(env);
  const session = describeFlowSessionStatus(env);

  return {
    provider: config.provider,
    liveEnabled: config.liveEnabled,
    uiVerifiedFlag: config.uiVerified,
    recipeVerified,
    gatesOk: gates.ok,
    gateReasons: gates.ok ? [] : gates.reasons,
    profileConfigured: Boolean(config.browserProfileDir.trim()),
    canaryOnly: config.canaryOnly,
    maxLiveScenesPerProject: config.maxLiveScenesPerProject,
    model: config.model,
    modelOptionLabel: config.modelOptionLabel,
    aspectRatio: config.aspectRatio,
    resolution: config.resolution,
    durationSeconds: config.durationSeconds,
    maxDailyCreditBudget: config.maxDailyCreditBudget,
    estimatedCostPerScene: config.estimatedCostPerScene,
    session,
  };
}
