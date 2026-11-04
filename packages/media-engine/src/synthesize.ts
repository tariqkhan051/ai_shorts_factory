import { runCommand } from './run-command.js';
import type { MediaToolPaths } from './paths.js';

export type SynthesizeClipInput = {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  /** Optional solid color name/hex for lavfi color source */
  color?: string;
  label?: string;
};

/**
 * Generate a silent placeholder clip for mock/dev assembly when scene assets are not real videos.
 */
export async function synthesizeColorClip(
  paths: MediaToolPaths,
  input: SynthesizeClipInput,
): Promise<void> {
  const color = input.color ?? 'black';
  const result = await runCommand(paths.ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=${input.width}x${input.height}:d=${input.durationSeconds}:r=${input.fps}`,
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]);

  if (result.code !== 0) {
    throw new Error(
      `Failed to synthesize placeholder clip${input.label ? ` (${input.label})` : ''}: ${result.stderr}`,
    );
  }
}
