import { BUSINESS_DEFAULTS, MATCH_EDIT_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { MediaProbe } from './probe.js';
import { evaluateQualityGates, type QualityGateResult } from './quality.js';

export type MatchEditQualityProfile = 'short' | 'condensed';

export type MatchEditQualityInput = {
  probe: MediaProbe;
  profile: MatchEditQualityProfile;
  maxSeconds?: number;
  targetWidth?: number;
  targetHeight?: number;
  targetFps?: number;
  upscaledFromLowerResolution?: boolean;
};

/**
 * Quality gates for match edits: Shorts stay ≤59s; condensed allows longer outputs.
 */
export function evaluateMatchEditQualityGates(input: MatchEditQualityInput): QualityGateResult {
  const maxSeconds =
    input.maxSeconds ??
    (input.profile === 'short'
      ? MATCH_EDIT_DEFAULTS.short_max_seconds
      : MATCH_EDIT_DEFAULTS.condensed_max_seconds);

  return evaluateQualityGates({
    probe: input.probe,
    maxSeconds,
    targetWidth: input.targetWidth ?? BUSINESS_DEFAULTS.finalVideoTargetWidth,
    targetHeight: input.targetHeight ?? BUSINESS_DEFAULTS.finalVideoTargetHeight,
    targetFps: input.targetFps ?? BUSINESS_DEFAULTS.finalVideoFps,
    upscaledFromLowerResolution: input.upscaledFromLowerResolution,
  });
}
