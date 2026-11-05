import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { probeMedia } from './probe.js';
import { assertMediaToolsAvailable, resolveMediaToolPaths, type MediaToolPaths } from './paths.js';
import { runCommand } from './run-command.js';

/** Normalized crop rectangle (0–1 relative to frame width/height). */
export type NormalizedRegionBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CropRegionInput = {
  imagePath: string;
  outputPath: string;
  box: NormalizedRegionBox;
  paths?: MediaToolPaths;
};

/**
 * Crop a normalized HUD region from a still frame using FFmpeg.
 */
export async function cropNormalizedRegion(input: CropRegionInput): Promise<string> {
  const paths = input.paths ?? resolveMediaToolPaths();
  await assertMediaToolsAvailable(paths);
  await mkdir(dirname(input.outputPath), { recursive: true });

  const probe = await probeMedia(paths, input.imagePath);
  const width = probe.width ?? 0;
  const height = probe.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Cannot crop region: invalid frame size for ${input.imagePath}`);
  }

  const x = Math.max(0, Math.floor(input.box.x * width));
  const y = Math.max(0, Math.floor(input.box.y * height));
  const w = Math.max(1, Math.floor(input.box.w * width));
  const h = Math.max(1, Math.floor(input.box.h * height));
  const cropW = Math.min(w, width - x);
  const cropH = Math.min(h, height - y);

  const result = await runCommand(paths.ffmpeg, [
    '-y',
    '-i',
    input.imagePath,
    '-vf',
    `crop=${cropW}:${cropH}:${x}:${y}`,
    input.outputPath,
  ]);
  if (result.code !== 0) {
    throw new Error(`Failed to crop region: ${result.stderr || result.stdout}`);
  }
  return input.outputPath;
}
