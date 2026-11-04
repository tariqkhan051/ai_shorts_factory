export type FlowLiveGateInput = {
  flowProvider?: string;
  flowLiveEnabled?: string;
  flowUiVerified?: string;
  browserProfileDir?: string;
  recipeVerified: boolean;
  nodeEnv?: string;
  ci?: string;
  /** When true, also require FLOW_EXECUTE_LIVE / canary flags for execute paths. */
  requireExecuteLive?: boolean;
  flowExecuteLive?: string;
  flowCanaryOnly?: string;
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
  if (input.requireExecuteLive) {
    if (input.flowExecuteLive !== 'true') {
      reasons.push('FLOW_EXECUTE_LIVE must be true to spend real credits');
    }
    if (input.flowCanaryOnly === 'false') {
      // Unlock is allowed only after canary review; still valid for gates.
    } else if (input.flowCanaryOnly !== 'true' && input.flowCanaryOnly !== undefined) {
      reasons.push('FLOW_CANARY_ONLY must be true or false');
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** Extra gates for the canary execute path (not required for mere provider construction). */
export function evaluateFlowExecuteGates(
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
    requireExecuteLive: true,
    flowExecuteLive: env.FLOW_EXECUTE_LIVE,
    flowCanaryOnly: env.FLOW_CANARY_ONLY,
  });
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
