import { runCommand } from './run-command.js';
import type { MediaToolPaths } from './paths.js';

export type SynthesizeClipInput = {
  outputPath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  /** Solid color name/hex for lavfi color source — must be unique per mock scene. */
  color?: string;
  /** Diagnostic label only (logged in errors); visual distinction uses unique colors. */
  label?: string;
};

/** Distinct palette for mock scene placeholders (not AI-generated footage). */
export const MOCK_SCENE_COLORS = [
  '0xe74c3c',
  '0x3498db',
  '0x2ecc71',
  '0xf1c40f',
  '0x9b59b6',
] as const;

export function mockSceneColor(sceneNumber: number): string {
  const index = Math.max(0, sceneNumber - 1) % MOCK_SCENE_COLORS.length;
  return MOCK_SCENE_COLORS[index]!;
}

/**
 * Generate a silent placeholder clip for mock/dev assembly when scene assets are not real videos.
 * Callers must pass a unique color per scene so segments are distinguishable.
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
    '-metadata',
    `comment=${input.label ?? 'mock-placeholder'}`,
    input.outputPath,
  ]);

  if (result.code !== 0) {
    throw new Error(
      `Failed to synthesize placeholder clip${input.label ? ` (${input.label})` : ''}: ${result.stderr}`,
    );
  }
}
