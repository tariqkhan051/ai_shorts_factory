import type { FlowSessionStatus } from '@ai-shorts-factory/shared-types';
import { isLiveFlowProviderName, readFlowLiveConfig, type FlowLiveConfig } from './flow-live-config.js';
import { readFlowLiveGateEnv } from './flow-live-gates.js';
import { isRecipeVerified } from './flow-ui-recipe.js';
import { loadFlowUiRecipeFromEnv } from './load-recipe-env.js';

export type FlowSessionStatusReport = {
  status: FlowSessionStatus;
  provider: string;
  message: string;
  liveEnabled: boolean;
  canaryOnly: boolean;
  maxLiveScenesPerProject: number;
  model: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  maxDailyCreditBudget: number;
  estimatedCostPerScene: number | 'unknown';
  gatesOk: boolean;
  gateReasons: string[];
  profileConfigured: boolean;
  uiVerifiedFlag: boolean;
  recipeVerified: boolean;
};

/**
 * Derive dashboard session status without launching a browser.
 * AUTHENTICATION_REQUIRED / SESSION_EXPIRED / HUMAN_INTERVENTION_REQUIRED are
 * refined at runtime by the Playwright provider after opening Flow.
 */
export function describeFlowSessionStatus(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<FlowLiveConfig> & {
    runtimeHint?: FlowSessionStatus;
    runtimeMessage?: string;
  },
): FlowSessionStatusReport {
  const config = { ...readFlowLiveConfig(env), ...overrides };
  const recipe = loadFlowUiRecipeFromEnv(env);
  const recipeVerified = isRecipeVerified(recipe);
  const gates = readFlowLiveGateEnv(env, recipeVerified);
  const provider = config.provider;

  if (overrides?.runtimeHint) {
    return {
      status: overrides.runtimeHint,
      provider,
      message: overrides.runtimeMessage ?? overrides.runtimeHint,
      liveEnabled: config.liveEnabled,
      canaryOnly: config.canaryOnly,
      maxLiveScenesPerProject: config.maxLiveScenesPerProject,
      model: config.model,
      aspectRatio: config.aspectRatio,
      resolution: config.resolution,
      durationSeconds: config.durationSeconds,
      maxDailyCreditBudget: config.maxDailyCreditBudget,
      estimatedCostPerScene: config.estimatedCostPerScene,
      gatesOk: gates.ok,
      gateReasons: gates.ok ? [] : gates.reasons,
      profileConfigured: Boolean(config.browserProfileDir.trim()),
      uiVerifiedFlag: config.uiVerified,
      recipeVerified,
    };
  }

  if (!isLiveFlowProviderName(provider)) {
    return baseReport(config, recipeVerified, gates, 'NOT_CONFIGURED', 'Using mock provider');
  }

  if (!config.liveEnabled || !config.browserProfileDir.trim() || !config.uiVerified) {
    return baseReport(
      config,
      recipeVerified,
      gates,
      'NOT_CONFIGURED',
      gates.ok ? 'Live Flow not fully configured' : gates.reasons.join('; '),
    );
  }

  if (!gates.ok) {
    return baseReport(config, recipeVerified, gates, 'ERROR', gates.reasons.join('; '));
  }

  return baseReport(
    config,
    recipeVerified,
    gates,
    'READY',
    'Live gates open — confirm authentication in the browser profile before spending credits',
  );
}

function baseReport(
  config: FlowLiveConfig,
  recipeVerified: boolean,
  gates: { ok: boolean; reasons?: string[] },
  status: FlowSessionStatus,
  message: string,
): FlowSessionStatusReport {
  return {
    status,
    provider: config.provider,
    message,
    liveEnabled: config.liveEnabled,
    canaryOnly: config.canaryOnly,
    maxLiveScenesPerProject: config.maxLiveScenesPerProject,
    model: config.model,
    aspectRatio: config.aspectRatio,
    resolution: config.resolution,
    durationSeconds: config.durationSeconds,
    maxDailyCreditBudget: config.maxDailyCreditBudget,
    estimatedCostPerScene: config.estimatedCostPerScene,
    gatesOk: gates.ok,
    gateReasons: gates.ok ? [] : (gates.reasons ?? []),
    profileConfigured: Boolean(config.browserProfileDir.trim()),
    uiVerifiedFlag: config.uiVerified,
    recipeVerified,
  };
}
