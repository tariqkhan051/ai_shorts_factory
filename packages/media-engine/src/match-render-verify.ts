import { stat } from 'node:fs/promises';
import { probeMedia } from './probe.js';
import { resolveMediaToolPaths, type MediaToolPaths } from './paths.js';

export type MatchRenderVerification = {
  ok: boolean;
  outputPath: string;
  byteSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  errors: string[];
};

/**
 * Verify a rendered Match Studio output exists and probes as a valid media file.
 * Never marks success when the file is missing/empty or FFprobe fails.
 */
export async function verifyMatchRenderOutput(input: {
  outputPath: string;
  minBytes?: number;
  minDurationSeconds?: number;
  paths?: MediaToolPaths;
}): Promise<MatchRenderVerification> {
  const errors: string[] = [];
  try {
    const info = await stat(input.outputPath);
    if (info.size <= (input.minBytes ?? 1024)) {
      errors.push(`Output too small (${info.size} bytes)`);
    }
    const paths = input.paths ?? resolveMediaToolPaths();
    const probe = await probeMedia(paths, input.outputPath);
    if (!probe.durationSeconds || probe.durationSeconds <= 0) {
      errors.push('Probe reported non-positive duration');
    }
    if (
      input.minDurationSeconds !== undefined &&
      (probe.durationSeconds ?? 0) < input.minDurationSeconds
    ) {
      errors.push(
        `Duration ${probe.durationSeconds}s below minimum ${input.minDurationSeconds}s`,
      );
    }
    return {
      ok: errors.length === 0,
      outputPath: input.outputPath,
      byteSize: info.size,
      durationSeconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Verification failed');
    return {
      ok: false,
      outputPath: input.outputPath,
      byteSize: 0,
      durationSeconds: null,
      width: null,
      height: null,
      errors,
    };
  }
}
