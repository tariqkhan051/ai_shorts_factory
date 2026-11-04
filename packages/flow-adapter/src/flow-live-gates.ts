export type FlowLiveGateInput = {
  flowProvider?: string;
  flowLiveEnabled?: string;
  flowUiVerified?: string;
  browserProfileDir?: string;
  recipeVerified: boolean;
  nodeEnv?: string;
  ci?: string;
};

export type FlowLiveGateResult = { ok: true } | { ok: false; reasons: string[] };

/**
 * Hard safety gates for live Google Flow. CI and default local runs stay on mock.
 */
export function evaluateFlowLiveGates(input: FlowLiveGateInput): FlowLiveGateResult {
  const reasons: string[] = [];
  const provider = (input.flowProvider ?? 'mock').toLowerCase();
  const ci = (input.ci ?? '').toLowerCase() === 'true' || input.ci === '1';
  const nodeEnv = input.nodeEnv ?? 'development';

  if (provider !== 'playwright' && provider !== 'google-flow') {
    reasons.push(`FLOW_PROVIDER=${provider} (expected playwright for live Flow)`);
  }
  if (input.flowLiveEnabled !== 'true') {
    reasons.push('FLOW_LIVE_ENABLED must be true');
  }
  if (input.flowUiVerified !== 'true') {
    reasons.push('FLOW_UI_VERIFIED must be true (operator confirmed selectors against live UI)');
  }
  if (!input.browserProfileDir?.trim()) {
    reasons.push('FLOW_BROWSER_PROFILE_DIR is required (persistent encrypted session profile)');
  }
  if (!input.recipeVerified) {
    reasons.push('Flow UI recipe is unverified or missing required selectors');
  }
  if (ci) {
    reasons.push('CI must never enable live Flow (FLOW_PROVIDER=mock only)');
  }
  if (nodeEnv === 'test') {
    reasons.push('NODE_ENV=test must not open live Flow');
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function readFlowLiveGateEnv(
  env: NodeJS.ProcessEnv,
  recipeVerified: boolean,
): FlowLiveGateResult {
  return evaluateFlowLiveGates({
    flowProvider: env.FLOW_PROVIDER,
    flowLiveEnabled: env.FLOW_LIVE_ENABLED,
    flowUiVerified: env.FLOW_UI_VERIFIED,
    browserProfileDir: env.FLOW_BROWSER_PROFILE_DIR,
    recipeVerified,
    nodeEnv: env.NODE_ENV,
    ci: env.CI,
  });
}
