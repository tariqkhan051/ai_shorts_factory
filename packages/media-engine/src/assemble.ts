import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BUSINESS_DEFAULTS } from '@ai-shorts-factory/shared-types';
import { isReadableVideo, probeMedia } from './probe.js';
import { evaluateQualityGates, type QualityGateResult } from './quality.js';
import { assertMediaToolsAvailable, resolveMediaToolPaths, type MediaToolPaths } from './paths.js';
import { runCommand } from './run-command.js';
import { mockSceneColor, synthesizeColorClip } from './synthesize.js';

export type AssemblySceneInput = {
  /** Local path to scene media (may be non-video placeholder bytes in mock mode). */
  path: string;
  durationSeconds: number;
  sceneNumber: number;
};

export type AssembleProjectInput = {
  scenes: AssemblySceneInput[];
  workDir: string;
  outputPath: string;
  maxSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  /** When scene files are not real videos, synthesize color clips (mock/dev). */
  allowSyntheticPlaceholders?: boolean;
  paths?: MediaToolPaths;
};

export type AssembleProjectResult = {
  outputPath: string;
  normalizedScenePaths: string[];
  usedSyntheticPlaceholders: boolean;
  upscaledFromLowerResolution: boolean;
  probe: Awaited<ReturnType<typeof probeMedia>>;
  quality: QualityGateResult;
};

function scalePadFilter(width: number, height: number, fps: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},format=yuv420p`;
}

async function normalizeScene(
  paths: MediaToolPaths,
  scene: AssemblySceneInput,
  workDir: string,
  width: number,
  height: number,
  fps: number,
  allowSynthetic: boolean,
): Promise<{ path: string; synthetic: boolean; sourceLowerRes: boolean }> {
  const outPath = join(workDir, `normalized-scene-${scene.sceneNumber}.mp4`);
  const readable = await isReadableVideo(paths, scene.path);

  if (!readable) {
    if (!allowSynthetic) {
      throw new Error(
        `Scene ${scene.sceneNumber} at ${scene.path} is not a readable video and placeholders are disabled`,
      );
    }
    await synthesizeColorClip(paths, {
      outputPath: outPath,
      durationSeconds: scene.durationSeconds,
      width,
      height,
      fps,
      color: mockSceneColor(scene.sceneNumber),
      label: `MOCK_scene-${scene.sceneNumber}`,
    });
    return { path: outPath, synthetic: true, sourceLowerRes: true };
  }

  const probe = await probeMedia(paths, scene.path);
  const sourceLowerRes = (probe.width ?? 0) < width || (probe.height ?? 0) < height;

  const result = await runCommand(paths.ffmpeg, [
    '-y',
    '-i',
    scene.path,
    '-vf',
    scalePadFilter(width, height, fps),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    outPath,
  ]);

  if (result.code !== 0) {
    throw new Error(`Failed to normalize scene ${scene.sceneNumber}: ${result.stderr}`);
  }

  return { path: outPath, synthetic: false, sourceLowerRes };
}

/**
 * Sequentially assemble scene clips into a vertical short under maxSeconds.
 */
export async function assembleProject(input: AssembleProjectInput): Promise<AssembleProjectResult> {
  if (input.scenes.length === 0) {
    throw new Error('At least one scene is required for assembly');
  }

  const paths = input.paths ?? resolveMediaToolPaths();
  await assertMediaToolsAvailable(paths);

  const width = input.width ?? BUSINESS_DEFAULTS.finalVideoTargetWidth;
  const height = input.height ?? BUSINESS_DEFAULTS.finalVideoTargetHeight;
  const fps = input.fps ?? BUSINESS_DEFAULTS.finalVideoFps;
  const maxSeconds = input.maxSeconds ?? BUSINESS_DEFAULTS.finalVideoMaxSeconds;
  const allowSynthetic = input.allowSyntheticPlaceholders ?? false;

  await mkdir(input.workDir, { recursive: true });
  await mkdir(dirname(input.outputPath), { recursive: true });

  const normalized: string[] = [];
  let usedSynthetic = false;
  let upscaled = false;

  const sortedScenes = [...input.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
  const seenSceneNumbers = new Set<number>();
  for (const scene of sortedScenes) {
    if (seenSceneNumbers.has(scene.sceneNumber)) {
      throw new Error(`Duplicate sceneNumber ${scene.sceneNumber} in assembly inputs`);
    }
    seenSceneNumbers.add(scene.sceneNumber);
    if (!scene.path) {
      throw new Error(`Scene ${scene.sceneNumber} has an empty path`);
    }

    const result = await normalizeScene(
      paths,
      scene,
      input.workDir,
      width,
      height,
      fps,
      allowSynthetic,
    );
    normalized.push(result.path);
    usedSynthetic = usedSynthetic || result.synthetic;
    upscaled = upscaled || result.sourceLowerRes;
  }

  await assertDistinctSceneFiles(normalized);

  const listPath = join(input.workDir, 'concat.txt');
  const listBody = normalized.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, listBody, 'utf8');

  const concatPath = join(input.workDir, 'concat-raw.mp4');
  const concatResult = await runCommand(paths.ffmpeg, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    concatPath,
  ]);
  if (concatResult.code !== 0) {
    // Re-encode concat fallback when stream copy fails across sources.
    const reencode = await runCommand(paths.ffmpeg, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      concatPath,
    ]);
    if (reencode.code !== 0) {
      throw new Error(`Concat failed: ${reencode.stderr || concatResult.stderr}`);
    }
  }

  // Hard cap under business max (59s). Prefer -t trim over dropping scenes.
  const finalResult = await runCommand(paths.ffmpeg, [
    '-y',
    '-i',
    concatPath,
    '-t',
    String(maxSeconds),
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]);
  if (finalResult.code !== 0) {
    const reencodeFinal = await runCommand(paths.ffmpeg, [
      '-y',
      '-i',
      concatPath,
      '-t',
      String(maxSeconds),
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
    if (reencodeFinal.code !== 0) {
      throw new Error(`Final trim/export failed: ${reencodeFinal.stderr}`);
    }
  }

  const probe = await probeMedia(paths, input.outputPath);
  const quality = evaluateQualityGates({
    probe,
    maxSeconds,
    targetWidth: width,
    targetHeight: height,
    targetFps: fps,
    upscaledFromLowerResolution: upscaled || usedSynthetic,
  });

  if (!quality.ok) {
    throw new Error(`Quality gates failed: ${quality.failures.join('; ')}`);
  }

  return {
    outputPath: input.outputPath,
    normalizedScenePaths: normalized,
    usedSyntheticPlaceholders: usedSynthetic,
    upscaledFromLowerResolution: upscaled || usedSynthetic,
    probe,
    quality,
  };
}

async function assertDistinctSceneFiles(paths: string[]): Promise<void> {
  const hashes = new Map<string, string>();
  for (const filePath of paths) {
    const bytes = await readFile(filePath);
    if (bytes.byteLength === 0) {
      throw new Error(`Normalized scene file is empty: ${filePath}`);
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    const prior = hashes.get(digest);
    if (prior) {
      throw new Error(
        `Duplicate normalized scene content detected (${prior} and ${filePath}). Mock placeholders must be distinct per scene.`,
      );
    }
    hashes.set(digest, filePath);
  }
}
