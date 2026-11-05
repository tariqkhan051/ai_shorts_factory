import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assertMediaToolsAvailable, resolveMediaToolPaths, type MediaToolPaths } from './paths.js';
import { runCommand } from './run-command.js';

export type SampleFramesInput = {
  videoPath: string;
  outputDir: string;
  timestampsSeconds: number[];
  /** Hard cap on frames written. */
  maxFrames?: number;
  paths?: MediaToolPaths;
};

export type SampledFrame = {
  index: number;
  timestampSeconds: number;
  path: string;
};

/**
 * Sample still frames at explicit timestamps via FFmpeg (no paid vision APIs).
 */
export async function sampleFramesAtTimestamps(
  input: SampleFramesInput,
): Promise<SampledFrame[]> {
  const paths = input.paths ?? resolveMediaToolPaths();
  await assertMediaToolsAvailable(paths);
  await mkdir(input.outputDir, { recursive: true });

  const maxFrames = input.maxFrames ?? input.timestampsSeconds.length;
  const timestamps = input.timestampsSeconds.slice(0, maxFrames);
  const frames: SampledFrame[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestampSeconds = timestamps[index]!;
    const outputPath = join(input.outputDir, `frame-${String(index).padStart(3, '0')}.png`);
    const result = await runCommand(paths.ffmpeg, [
      '-y',
      '-ss',
      String(timestampSeconds),
      '-i',
      input.videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outputPath,
    ]);
    if (result.code !== 0) {
      throw new Error(
        `Failed to sample frame at ${timestampSeconds}s: ${result.stderr || result.stdout}`,
      );
    }
    frames.push({ index, timestampSeconds, path: outputPath });
  }

  return frames;
}
