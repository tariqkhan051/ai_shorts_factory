import { describe, expect, it } from 'vitest';
import { evaluateFlowLiveGates } from './flow-live-gates.js';

describe('evaluateFlowLiveGates', () => {
  it('passes when all live gates are satisfied', () => {
    const result = evaluateFlowLiveGates({
      flowProvider: 'playwright',
      flowLiveEnabled: 'true',
      flowUiVerified: 'true',
      browserProfileDir: '/tmp/flow-profile',
      recipeVerified: true,
      nodeEnv: 'development',
      ci: undefined,
    });
    expect(result).toEqual({ ok: true });
  });

  it('blocks CI and unverified recipes', () => {
    const result = evaluateFlowLiveGates({
      flowProvider: 'playwright',
      flowLiveEnabled: 'true',
      flowUiVerified: 'true',
      browserProfileDir: '/tmp/flow-profile',
      recipeVerified: false,
      nodeEnv: 'development',
      ci: 'true',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((reason) => /CI/i.test(reason))).toBe(true);
      expect(result.reasons.some((reason) => /recipe/i.test(reason))).toBe(true);
    }
  });

  it('requires explicit live enablement', () => {
    const result = evaluateFlowLiveGates({
      flowProvider: 'mock',
      flowLiveEnabled: 'false',
      flowUiVerified: 'false',
      browserProfileDir: '',
      recipeVerified: false,
      nodeEnv: 'development',
    });
    expect(result.ok).toBe(false);
  });
});
