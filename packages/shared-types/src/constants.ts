/** Default business configuration — overridable via system_settings / env. */
export const BUSINESS_DEFAULTS = {
  dailyFlowCreditBudget: 50,
  sceneCount: 5,
  estimatedCostPerScene: 10,
  maxGenerationsPerProject: 5,
  /** Veo 3.1 - Lite Scenes UI shows a fixed 8s clip (override via DEFAULT_GENERATION_DURATION_SECONDS). */
  defaultGenerationDurationSeconds: 8,
  defaultGenerationResolution: '720p',
  defaultGenerationAspectRatio: '9:16',
  /** Must match a visible Google Flow UI model label (override via DEFAULT_GENERATION_MODEL). */
  defaultGenerationModel: 'Veo 3.1 - Lite',
  finalVideoMaxSeconds: 59,
  finalVideoTargetWidth: 1080,
  finalVideoTargetHeight: 1920,
  finalVideoFps: 30,
  defaultTimezone: 'Asia/Karachi',
  /** Live canary: at most one scene until operator unlocks full run. */
  canaryMaxLiveScenesPerProject: 1,
  /** Live concurrency hard cap — never run multiple live Flow jobs in parallel. */
  maxSimultaneousLiveGenerations: 1,
  flowPollIntervalMs: 5_000,
  flowGenerationTimeoutMs: 10 * 60_000,
} as const;

export const PHASE = {
  current: 7,
  name: 'Hardening and Deployment',
} as const;
