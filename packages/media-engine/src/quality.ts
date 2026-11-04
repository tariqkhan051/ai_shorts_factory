import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import type { MediaProbe } from './probe.js';

export type QualityGateInput = {
  probe: MediaProbe;
  maxSeconds?: number;
  targetWidth?: number;
  targetHeight?: number;
  targetFps?: number;
  /** When true, sources were upscaled to target; label must not claim native generation. */
  upscaledFromLowerResolution?: boolean;
};

export type QualityGateResult =
  | {
      ok: true;
      durationSeconds: number;
      width: number;
      height: number;
      fps: number | null;
      upscaled: boolean;
      notes: string[];
    }
  | { ok: false; failures: string[] };

export function evaluateQualityGates(input: QualityGateInput): QualityGateResult {
  const maxSeconds = input.maxSeconds ?? BUSINESS_DEFAULTS.finalVideoMaxSeconds;
  const targetWidth = input.targetWidth ?? BUSINESS_DEFAULTS.finalVideoTargetWidth;
  const targetHeight = input.targetHeight ?? BUSINESS_DEFAULTS.finalVideoTargetHeight;
  const failures: string[] = [];
  const notes: string[] = [];

  if (!input.probe.hasVideo) {
    failures.push('Output has no video stream');
  }
  if (input.probe.durationSeconds <= 0) {
    failures.push('Output duration is zero');
  }
  if (input.probe.durationSeconds > maxSeconds + 0.05) {
    failures.push(
      `Output duration ${input.probe.durationSeconds.toFixed(2)}s exceeds max ${maxSeconds}s`,
    );
  }
  if (input.probe.width !== targetWidth || input.probe.height !== targetHeight) {
    failures.push(
      `Expected ${targetWidth}x${targetHeight}, got ${input.probe.width}x${input.probe.height}`,
    );
  }

  if (input.upscaledFromLowerResolution) {
    notes.push(
      'Final frame size is target canvas via scale/pad; do not label as native 1080p generation.',
    );
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  return {
    ok: true,
    durationSeconds: input.probe.durationSeconds,
    width: input.probe.width ?? targetWidth,
    height: input.probe.height ?? targetHeight,
    fps: input.probe.fps,
    upscaled: Boolean(input.upscaledFromLowerResolution),
    notes,
  };
}
