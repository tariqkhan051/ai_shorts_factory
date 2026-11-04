import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';

/**
 * Operator-configurable live Google Flow settings.
 * Values are read from env — never hardcode pricing or available models as facts.
 */
export type FlowLiveConfig = {
  provider: string;
  liveEnabled: boolean;
  canaryOnly: boolean;
  maxLiveScenesPerProject: number;
  maxSimultaneousGenerations: number;
  baseUrl: string;
  browserProfileDir: string;
  /** Request/logging model id — usually the Flow UI label. */
  model: string;
  /**
   * Exact Flow UI option label for Playwright selection.
   * Override with FLOW_MODEL_OPTION_LABEL when it differs from `model`.
   */
  modelOptionLabel: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  generationTimeoutMs: number;
  pollIntervalMs: number;
  maxDailyCreditBudget: number;
  estimatedCostPerScene: number | 'unknown';
  uiVerified: boolean;
  headless: boolean;
  diagnosticDir: string;
  recipePath: string;
};

/**
 * Resolve the Flow UI model menu label.
 * Priority: FLOW_MODEL_OPTION_LABEL → DEFAULT_GENERATION_MODEL → recipe → business default.
 */
export function resolveFlowModelOptionLabel(
  env: NodeJS.ProcessEnv = process.env,
  recipeModelOptionLabel?: string | null,
): string {
  const fromExplicit = env.FLOW_MODEL_OPTION_LABEL?.trim();
  if (fromExplicit) return fromExplicit;
  const fromDefault = env.DEFAULT_GENERATION_MODEL?.trim();
  if (fromDefault) return fromDefault;
  const fromRecipe = recipeModelOptionLabel?.trim();
  if (fromRecipe) return fromRecipe;
  return BUSINESS_DEFAULTS.defaultGenerationModel;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function readFlowLiveConfig(env: NodeJS.ProcessEnv = process.env): FlowLiveConfig {
  const canaryOnly = env.FLOW_CANARY_ONLY !== 'false';
  const estimatedRaw = env.DEFAULT_COST_PER_SCENE?.trim();
  const estimatedParsed = estimatedRaw ? Number(estimatedRaw) : Number.NaN;

  return {
    provider: (env.FLOW_PROVIDER ?? 'mock').toLowerCase(),
    liveEnabled: env.FLOW_LIVE_ENABLED === 'true',
    canaryOnly,
    maxLiveScenesPerProject: parsePositiveInt(
      env.FLOW_MAX_LIVE_SCENES_PER_PROJECT,
      canaryOnly
        ? BUSINESS_DEFAULTS.canaryMaxLiveScenesPerProject
        : BUSINESS_DEFAULTS.maxGenerationsPerProject,
    ),
    maxSimultaneousGenerations: parsePositiveInt(
      env.FLOW_MAX_SIMULTANEOUS_GENERATIONS,
      BUSINESS_DEFAULTS.maxSimultaneousLiveGenerations,
    ),
    baseUrl: env.FLOW_BASE_URL?.trim() ?? '',
    browserProfileDir: env.FLOW_BROWSER_PROFILE_DIR?.trim() ?? '',
    model: env.DEFAULT_GENERATION_MODEL?.trim() || BUSINESS_DEFAULTS.defaultGenerationModel,
    modelOptionLabel: resolveFlowModelOptionLabel(env),
    aspectRatio:
      env.DEFAULT_GENERATION_ASPECT_RATIO?.trim() ||
      BUSINESS_DEFAULTS.defaultGenerationAspectRatio,
    resolution:
      env.DEFAULT_GENERATION_RESOLUTION?.trim() || BUSINESS_DEFAULTS.defaultGenerationResolution,
    durationSeconds: parsePositiveInt(
      env.DEFAULT_GENERATION_DURATION_SECONDS,
      BUSINESS_DEFAULTS.defaultGenerationDurationSeconds,
    ),
    generationTimeoutMs: parsePositiveInt(
      env.FLOW_GENERATION_TIMEOUT_MS,
      BUSINESS_DEFAULTS.flowGenerationTimeoutMs,
    ),
    pollIntervalMs: parsePositiveInt(
      env.FLOW_POLL_INTERVAL_MS,
      BUSINESS_DEFAULTS.flowPollIntervalMs,
    ),
    maxDailyCreditBudget: parsePositiveInt(
      env.DAILY_FLOW_CREDIT_BUDGET,
      BUSINESS_DEFAULTS.dailyFlowCreditBudget,
    ),
    estimatedCostPerScene: Number.isFinite(estimatedParsed)
      ? estimatedParsed
      : BUSINESS_DEFAULTS.estimatedCostPerScene,
    uiVerified: env.FLOW_UI_VERIFIED === 'true',
    headless: env.FLOW_HEADLESS !== 'false',
    diagnosticDir: env.FLOW_DIAGNOSTIC_SCREENSHOT_DIR?.trim() || './diagnostic-screenshots',
    recipePath:
      env.FLOW_UI_RECIPE_PATH?.trim() ||
      'packages/flow-adapter/recipes/google-flow.unverified.json',
  };
}

export function isLiveFlowProviderName(provider: string): boolean {
  const name = provider.toLowerCase();
  return name === 'playwright' || name === 'google-flow';
}

/**
 * Canary enforcement: when live + canary, force maxScenes to 1 unless operator unlocks.
 */
export function resolveLiveMaxScenes(config: FlowLiveConfig): number {
  if (!config.liveEnabled || !isLiveFlowProviderName(config.provider)) {
    return BUSINESS_DEFAULTS.sceneCount;
  }
  if (config.canaryOnly) {
    return Math.min(1, config.maxLiveScenesPerProject);
  }
  return Math.min(BUSINESS_DEFAULTS.sceneCount, config.maxLiveScenesPerProject);
}
