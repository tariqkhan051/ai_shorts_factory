/** Default business configuration — overridable via system_settings / env. */
export const BUSINESS_DEFAULTS = {
  dailyFlowCreditBudget: 50,
  sceneCount: 5,
  estimatedCostPerScene: 10,
  maxGenerationsPerProject: 5,
  defaultGenerationDurationSeconds: 6,
  defaultGenerationResolution: '720p',
  defaultGenerationModel: 'gemini-omni-flash',
  finalVideoMaxSeconds: 59,
  finalVideoTargetWidth: 1080,
  finalVideoTargetHeight: 1920,
  finalVideoFps: 30,
  defaultTimezone: 'Asia/Karachi',
} as const;

export const PHASE = {
  current: 7,
  name: 'Hardening and Deployment',
} as const;
